"""End-to-end: upload txt → worker ingest → hybrid search finds it.

Requires docker services. First run downloads embedding models (~150MB).
"""

import pytest
from sqlalchemy import select

from app.core.security import DEV_TENANT
from app.db.models import Collection, Document, DocumentStatus
from app.db.session import get_sessionmaker
from app.ingest.worker import ingest_document
from app.retrieval.vectorstore import hybrid_search

MARKER = "The Corpora platform uses reciprocal rank fusion for hybrid retrieval."


@pytest.mark.slow
async def test_ingest_and_search(tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text(f"Intro paragraph.\n\n{MARKER}\n\nClosing notes about testing.")

    async with get_sessionmaker()() as db:
        coll = Collection(tenant_id=DEV_TENANT, name="e2e")
        db.add(coll)
        await db.flush()
        doc = Document(
            tenant_id=DEV_TENANT,
            collection_id=coll.id,
            name="doc.txt",
            source_type="txt",
            source_uri=str(f),
        )
        db.add(doc)
        await db.commit()
        coll_id, doc_id = coll.id, doc.id

    result = await ingest_document({}, doc_id)
    assert result.startswith("ok:"), result

    async with get_sessionmaker()() as db:
        row = (await db.scalars(select(Document).where(Document.id == doc_id))).one()
        assert row.status == DocumentStatus.ready
        assert row.chunk_count >= 1

    hits = hybrid_search("what fusion method for hybrid retrieval?", DEV_TENANT, coll_id, limit=5)
    assert hits, "no search results"
    assert any("reciprocal rank fusion" in str(h.payload.get("text", "")).lower() for h in hits)

    # tenant isolation: other tenant sees nothing
    assert hybrid_search("fusion", "other-tenant", coll_id, limit=5) == []
