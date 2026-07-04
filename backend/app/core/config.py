from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production"] = "development"
    auth_mode: Literal["dev", "clerk"] = "dev"

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    database_url: str = "postgresql+asyncpg://corpora:corpora@localhost:5432/corpora"
    redis_url: str = "redis://localhost:6379/0"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    clerk_secret_key: str = ""
    clerk_publishable_key: str = ""
    clerk_jwks_url: str = ""

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    cors_origins: str = "http://localhost:3000"  # comma-separated, or *

    upload_dir: str = "uploads"
    max_upload_mb: int = 50

    dense_model: str = "BAAI/bge-small-en-v1.5"
    image_model: str = "Qdrant/clip-ViT-B-32-vision"
    sparse_model: str = "Qdrant/bm25"
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"


@lru_cache
def get_settings() -> Settings:
    return Settings()
