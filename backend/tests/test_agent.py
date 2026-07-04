"""Agent unit tests + live graph run (slow — needs Groq key, docker services)."""

import pytest

from app.agent.nodes import _parse_json, should_retry


def test_parse_json_clean():
    assert _parse_json('{"queries": ["a"]}') == {"queries": ["a"]}


def test_parse_json_with_prose():
    assert _parse_json('Sure! Here it is: {"grounded": false} hope that helps') == {
        "grounded": False
    }


def test_parse_json_garbage():
    assert _parse_json("no json here") == {}
    assert _parse_json("{broken") == {}


def test_should_retry_logic():
    assert should_retry({"grounded": True, "retries": 1}) == "__end__"
    assert should_retry({"grounded": False, "retries": 1}) == "answer"
    assert should_retry({"grounded": False, "retries": 2}) == "__end__"
    assert should_retry({}) == "__end__"


@pytest.mark.slow
async def test_agent_end_to_end(tmp_path):
    """Ingest a fact → ask the agent → grounded, cited answer."""
    from sqlalchemy import select

    from app.core.config import get_settings
    from app.core.security import DEV_TENANT
    from app.db.models import Collection, Document
    from app.db.session import get_sessionmaker
    from app.ingest.worker import ingest_document

    if not get_settings().groq_api_key:
        pytest.skip("GROQ_API_KEY not set")

    f = tmp_path / "facts.txt"
    f.write_text(
        "The Aurora project launched in March 2024.\n\n"
        "Aurora's lead engineer is Priya Sharma.\n\n"
        "The project budget was 2.4 million dollars."
    )
    async with get_sessionmaker()() as db:
        coll = Collection(tenant_id=DEV_TENANT, name="agent-e2e")
        db.add(coll)
        await db.flush()
        doc = Document(
            tenant_id=DEV_TENANT,
            collection_id=coll.id,
            name="facts.txt",
            source_type="txt",
            source_uri=str(f),
        )
        db.add(doc)
        await db.commit()
        coll_id, doc_id = coll.id, doc.id

    assert (await ingest_document({}, doc_id)).startswith("ok:")

    from app.agent.graph import get_graph

    final = await get_graph().ainvoke(
        {
            "question": "Who is the lead engineer of the Aurora project?",
            "tenant_id": DEV_TENANT,
            "collection_id": coll_id,
            "history": [],
            "retries": 0,
        }
    )
    assert "priya" in final["answer"].lower(), final["answer"]
    assert "[" in final["answer"], "no inline citation markers"
    assert final["citations"], "no citations attached"
    assert final.get("grounded", False) is True

    async with get_sessionmaker()() as db:
        doc_row = (await db.scalars(select(Document).where(Document.id == doc_id))).one()
        assert doc_row.chunk_count >= 1
