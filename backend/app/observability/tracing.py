"""Langfuse tracing — active only when keys are configured, otherwise no-op."""

from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def _handler():
    s = get_settings()
    if not (s.langfuse_public_key and s.langfuse_secret_key):
        return None
    try:
        import os

        os.environ.setdefault("LANGFUSE_PUBLIC_KEY", s.langfuse_public_key)
        os.environ.setdefault("LANGFUSE_SECRET_KEY", s.langfuse_secret_key)
        os.environ.setdefault("LANGFUSE_HOST", s.langfuse_host)
        from langfuse.langchain import CallbackHandler

        return CallbackHandler()
    except Exception as exc:  # noqa: BLE001 — tracing must never break requests
        import logging

        logging.getLogger(__name__).warning("Langfuse disabled: %s", exc)
        return None


def langchain_callbacks() -> list:
    h = _handler()
    return [h] if h else []
