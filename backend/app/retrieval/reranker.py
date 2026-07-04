"""Cross-encoder reranker (lazy-loaded ONNX model via fastembed)."""

from functools import lru_cache

from app.core.config import get_settings

CACHE_DIR = ".model_cache"


@lru_cache
def _reranker():
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(get_settings().rerank_model, cache_dir=CACHE_DIR)


def rerank(query: str, texts: list[str], top_k: int = 8) -> list[tuple[int, float]]:
    """Score (query, text) pairs; return [(original_index, score)] best-first, top_k."""
    if not texts:
        return []
    scores = list(_reranker().rerank(query, texts))
    order = sorted(range(len(texts)), key=lambda i: scores[i], reverse=True)
    return [(i, float(scores[i])) for i in order[:top_k]]
