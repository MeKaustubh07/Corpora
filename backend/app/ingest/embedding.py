"""Lazy-loaded FastEmbed models: dense text, sparse BM25, CLIP image.

Models download on first use into .model_cache/ (gitignored).
"""

from functools import lru_cache

from app.core.config import get_settings

CACHE_DIR = ".model_cache"


@lru_cache
def _dense():
    from fastembed import TextEmbedding

    return TextEmbedding(get_settings().dense_model, cache_dir=CACHE_DIR)


@lru_cache
def _sparse():
    from fastembed import SparseTextEmbedding

    return SparseTextEmbedding(get_settings().sparse_model, cache_dir=CACHE_DIR)


@lru_cache
def _image():
    from fastembed import ImageEmbedding

    return ImageEmbedding(get_settings().image_model, cache_dir=CACHE_DIR)


def embed_texts(texts: list[str]) -> tuple[list[list[float]], list[dict]]:
    """Returns (dense vectors, sparse vectors as {indices, values})."""
    dense = [v.tolist() for v in _dense().embed(texts)]
    sparse = [
        {"indices": s.indices.tolist(), "values": s.values.tolist()}
        for s in _sparse().embed(texts)
    ]
    return dense, sparse


def embed_query(text: str) -> tuple[list[float], dict]:
    dense, sparse = embed_texts([text])
    return dense[0], sparse[0]


def embed_images(paths: list[str]) -> list[list[float]]:
    return [v.tolist() for v in _image().embed(paths)]


def dense_dim() -> int:
    return 384  # bge-small-en-v1.5


def image_dim() -> int:
    return 512  # CLIP ViT-B/32
