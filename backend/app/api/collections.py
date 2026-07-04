from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import CollectionCreate, CollectionOut
from app.core.security import Principal, get_principal
from app.db.models import Collection
from app.db.session import get_db

router = APIRouter(prefix="/collections", tags=["collections"])


async def get_owned_collection(
    collection_id: str,
    db: AsyncSession,
    principal: Principal,
) -> Collection:
    coll = await db.get(Collection, collection_id)
    if coll is None or coll.tenant_id != principal.tenant_id:
        raise HTTPException(status_code=404, detail="Collection not found")
    return coll


@router.post("", response_model=CollectionOut, status_code=201)
async def create_collection(
    body: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    coll = Collection(tenant_id=principal.tenant_id, name=body.name, description=body.description)
    db.add(coll)
    await db.commit()
    await db.refresh(coll)
    return coll


@router.get("", response_model=list[CollectionOut])
async def list_collections(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    rows = await db.scalars(
        select(Collection)
        .where(Collection.tenant_id == principal.tenant_id)
        .order_by(Collection.created_at.desc())
    )
    return list(rows)


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_principal),
):
    coll = await get_owned_collection(collection_id, db, principal)
    await db.delete(coll)
    await db.commit()
