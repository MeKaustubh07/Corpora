"""Integration tests — require docker-compose services (postgres, redis, qdrant)."""

import httpx
import pytest

from app.main import create_app


@pytest.fixture
async def client():
    app = create_app()
    async with (
        httpx.ASGITransport(app=app) as transport,
    ):
        # lifespan manually: arq pool needed by upload endpoints
        from arq import create_pool
        from arq.connections import RedisSettings

        from app.core.config import get_settings

        app.state.arq = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as c:
            yield c
        await app.state.arq.close()


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readyz_all_services(client):
    resp = await client.get("/readyz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok", body


async def test_collection_crud(client):
    created = await client.post("/collections", json={"name": "test-coll", "description": "d"})
    assert created.status_code == 201
    cid = created.json()["id"]

    listed = await client.get("/collections")
    assert cid in [c["id"] for c in listed.json()]

    deleted = await client.delete(f"/collections/{cid}")
    assert deleted.status_code == 204

    listed = await client.get("/collections")
    assert cid not in [c["id"] for c in listed.json()]


async def test_collection_404_cross_tenant_shape(client):
    resp = await client.get("/collections/nonexistent-id/documents")
    assert resp.status_code == 404
