# Hugging Face Spaces (Docker SDK) — serves on port 7860
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy HOME=/app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

# bake embedding + reranker models into the image so cold starts skip downloads
RUN uv run python -c "\
from app.ingest.embedding import _dense, _sparse, _image, _clip_text; \
from app.retrieval.reranker import _reranker; \
_dense(); _sparse(); _image(); _clip_text(); _reranker()"

RUN mkdir -p uploads && chmod -R 777 uploads .model_cache

EXPOSE 7860
CMD ["bash", "entrypoint.sh"]
