"""ARQ background worker: parse → chunk → embed → upsert, with status updates."""

import uuid

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.db.models import Document, DocumentStatus
from app.db.session import get_sessionmaker
from app.ingest.chunking import chunk_text
from app.ingest.embedding import embed_images, embed_texts
from app.ingest.parsers import parse
from app.retrieval import vectorstore


async def _set_status(
    document_id: str, status: DocumentStatus, error: str = "", chunk_count: int | None = None
) -> None:
    async with get_sessionmaker()() as db:
        doc = await db.get(Document, document_id)
        if doc is None:
            return
        doc.status = status
        doc.error = error
        if chunk_count is not None:
            doc.chunk_count = chunk_count
        await db.commit()


async def ingest_document(ctx: dict, document_id: str) -> str:
    async with get_sessionmaker()() as db:
        doc = await db.get(Document, document_id)
        if doc is None:
            return "document not found"
        tenant_id, collection_id = doc.tenant_id, doc.collection_id
        source_type, source_uri, name = doc.source_type, doc.source_uri, doc.name

    await _set_status(document_id, DocumentStatus.processing)
    try:
        vectorstore.ensure_collections()
        if source_type == "image":
            vector = embed_images([source_uri])[0]
            vectorstore.upsert_image(
                str(uuid.uuid4()),
                vector,
                {
                    "tenant_id": tenant_id,
                    "collection_id": collection_id,
                    "document_id": document_id,
                    "document_name": name,
                    "path": source_uri,
                },
            )
            await _set_status(document_id, DocumentStatus.ready, chunk_count=1)
            return "ok:1"

        sections = parse(source_type, source_uri)
        chunks = [c for text, meta in sections for c in chunk_text(text, meta)]
        if not chunks:
            await _set_status(document_id, DocumentStatus.failed, error="No text extracted")
            return "empty"

        texts = [c.text for c in chunks]
        dense, sparse = embed_texts(texts)
        ids = [str(uuid.uuid4()) for _ in chunks]
        payloads = [
            {
                "tenant_id": tenant_id,
                "collection_id": collection_id,
                "document_id": document_id,
                "document_name": name,
                "chunk_index": c.index,
                "text": c.text,
                **c.meta,
            }
            for c in chunks
        ]
        vectorstore.upsert_text_chunks(ids, dense, sparse, payloads)
        await _set_status(document_id, DocumentStatus.ready, chunk_count=len(chunks))
        return f"ok:{len(chunks)}"
    except Exception as exc:  # noqa: BLE001 — worker must record any failure
        await _set_status(document_id, DocumentStatus.failed, error=str(exc)[:2000])
        return f"failed:{exc}"


class WorkerSettings:
    functions = [ingest_document]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 4
    job_timeout = 600
