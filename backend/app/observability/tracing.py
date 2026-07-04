"""Langfuse tracing — active only when keys are configured, otherwise no-op."""

from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def _handler():
    s = get_settings()
    if not (s.langfuse_public_key and s.langfuse_secret_key):
        return None
    from langfuse.langchain import CallbackHandler

    return CallbackHandler(
        public_key=s.langfuse_public_key,
        secret_key=s.langfuse_secret_key,
        host=s.langfuse_host,
    )


def langchain_callbacks() -> list:
    h = _handler()
    return [h] if h else []
