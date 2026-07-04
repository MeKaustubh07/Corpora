import asyncio
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, collections, documents, health
from app.core.config import get_settings
from app.retrieval.vectorstore import ensure_collections


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    # collections + payload indexes must exist before any search hits them
    await asyncio.to_thread(ensure_collections)
    yield
    await app.state.arq.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Corpora", version="0.1.0", lifespan=lifespan)
    origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials="*" not in origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(collections.router)
    app.include_router(documents.router)
    app.include_router(chat.router)
    return app


app = create_app()
