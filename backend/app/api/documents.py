import uuid
from pathlib import Path

import aiofiles
from arq import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.collections import get_owned_collection
from app.api.schemas import DocumentOut, SearchHit, SearchResponse, UrlIngest
from app.core.config import get_settings
from app.core.security import Principal, get_principal
from app.db.models import Document
from app.db.session import get_db
from app.ingest.parsers import detect_source_type
from app.retrieval import vectorstore

router = APIRouter(prefix="/collections/{collection_id}", tags=["documents"])


def _queue(request: Request) -> ArqRedis:
    return request.app.state.arq


async def _enqueue(request: Request, document_id: str) -> None:
    await _queue(request).enqueue_job("ingest_document", document_id)


@router.post("/documents", response_model=DocumentOut, status_code=202)
async def upload_document(
    collection_id: str,
    file: UploadFile,
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    await get_owned_collection(collection_id, db, principal)
    settings = get_settings()
    source_type = detect_source_type(file.filename or "")

    upload_dir = Path(settings.upload_dir) / principal.tenant_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{uuid.uuid4()}{Path(file.filename or '').suffix.lower()}"

    size = 0
    max_bytes = settings.max_upload_mb * 1024 * 1024
    async with aiofiles.open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                await out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"File over {settings.max_upload_mb}MB")
            await out.write(chunk)

    doc = Document(
        tenant_id=principal.tenant_id,
        collection_id=collection_id,
        name=file.filename or dest.name,
        source_type=source_type,
        source_uri=str(dest),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    await _enqueue(request, doc.id)
    return doc


@router.post("/urls", response_model=DocumentOut, status_code=202)
async def ingest_url(
    collection_id: str,
    body: UrlIngest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    await get_owned_collection(collection_id, db, principal)
    doc = Document(
        tenant_id=principal.tenant_id,
        collection_id=collection_id,
        name=str(body.url),
        source_type="url",
        source_uri=str(body.url),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    await _enqueue(request, doc.id)
    return doc


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    await get_owned_collection(collection_id, db, principal)
    rows = await db.scalars(
        select(Document)
        .where(Document.collection_id == collection_id)
        .order_by(Document.created_at.desc())
    )
    return list(rows)


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    collection_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    await get_owned_collection(collection_id, db, principal)
    doc = await db.get(Document, document_id)
    if doc is None or doc.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")
    vectorstore.delete_document(document_id)
    if doc.source_type != "url":
        Path(doc.source_uri).unlink(missing_ok=True)
    await db.delete(doc)
    await db.commit()


@router.get("/search", response_model=SearchResponse)
async def search(
    collection_id: str,
    q: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    """Direct hybrid retrieval — debugging/eval endpoint; chat agent uses same path."""
    await get_owned_collection(collection_id, db, principal)
    points = vectorstore.hybrid_search(q, principal.tenant_id, collection_id, limit=limit)
    hits = [
        SearchHit(
            score=p.score,
            text=str(p.payload.get("text", "")),
            document_id=str(p.payload.get("document_id", "")),
            document_name=str(p.payload.get("document_name", "")),
            chunk_index=int(p.payload.get("chunk_index", 0)),
        )
        for p in points
        if p.payload
    ]
    return SearchResponse(query=q, hits=hits)
