"""Qdrant wrapper: hybrid (dense+sparse) text collection + CLIP image collection.

All points carry tenant_id payload; every query filters on it — tenant isolation
enforced at the retrieval layer, not just the API layer.
"""

from functools import lru_cache

from qdrant_client import QdrantClient, models

from app.core.config import get_settings
from app.ingest.embedding import dense_dim, embed_query, image_dim

TEXT_COLLECTION = "corpora_text"
IMAGE_COLLECTION = "corpora_images"


@lru_cache
def get_client() -> QdrantClient:
    s = get_settings()
    return QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None)


def ensure_collections() -> None:
    client = get_client()
    if not client.collection_exists(TEXT_COLLECTION):
        client.create_collection(
            TEXT_COLLECTION,
            vectors_config={
                "dense": models.VectorParams(size=dense_dim(), distance=models.Distance.COSINE)
            },
            sparse_vectors_config={
                "sparse": models.SparseVectorParams(modifier=models.Modifier.IDF)
            },
        )
        client.create_payload_index(
            TEXT_COLLECTION, "tenant_id", models.PayloadSchemaType.KEYWORD
        )
        client.create_payload_index(
            TEXT_COLLECTION, "collection_id", models.PayloadSchemaType.KEYWORD
        )
    if not client.collection_exists(IMAGE_COLLECTION):
        client.create_collection(
            IMAGE_COLLECTION,
            vectors_config={
                "clip": models.VectorParams(size=image_dim(), distance=models.Distance.COSINE)
            },
        )
        client.create_payload_index(
            IMAGE_COLLECTION, "tenant_id", models.PayloadSchemaType.KEYWORD
        )


def _tenant_filter(tenant_id: str, collection_id: str | None) -> models.Filter:
    must: list[models.Condition] = [
        models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id))
    ]
    if collection_id:
        must.append(
            models.FieldCondition(key="collection_id", match=models.MatchValue(value=collection_id))
        )
    return models.Filter(must=must)


def upsert_text_chunks(
    ids: list[str],
    dense: list[list[float]],
    sparse: list[dict],
    payloads: list[dict],
) -> None:
    points = [
        models.PointStruct(
            id=ids[i],
            vector={
                "dense": dense[i],
                "sparse": models.SparseVector(**sparse[i]),
            },
            payload=payloads[i],
        )
        for i in range(len(ids))
    ]
    get_client().upsert(TEXT_COLLECTION, points=points, wait=True)


def upsert_image(point_id: str, vector: list[float], payload: dict) -> None:
    get_client().upsert(
        IMAGE_COLLECTION,
        points=[models.PointStruct(id=point_id, vector={"clip": vector}, payload=payload)],
        wait=True,
    )


def hybrid_search(
    query: str,
    tenant_id: str,
    collection_id: str | None = None,
    limit: int = 20,
) -> list[models.ScoredPoint]:
    """Dense + sparse prefetch, fused with Reciprocal Rank Fusion."""
    dense_vec, sparse_vec = embed_query(query)
    flt = _tenant_filter(tenant_id, collection_id)
    result = get_client().query_points(
        TEXT_COLLECTION,
        prefetch=[
            models.Prefetch(query=dense_vec, using="dense", filter=flt, limit=limit),
            models.Prefetch(
                query=models.SparseVector(**sparse_vec), using="sparse", filter=flt, limit=limit
            ),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        limit=limit,
        with_payload=True,
    )
    return list(result.points)


def delete_document(document_id: str) -> None:
    flt = models.Filter(
        must=[models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id))]
    )
    for coll in (TEXT_COLLECTION, IMAGE_COLLECTION):
        get_client().delete(coll, points_selector=models.FilterSelector(filter=flt))
