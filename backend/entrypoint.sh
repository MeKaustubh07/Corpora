#!/usr/bin/env bash
set -e

uv run alembic upgrade head

# ingestion worker + API in one container (Spaces runs a single container)
uv run arq app.ingest.worker.WorkerSettings &

exec uv run uvicorn app.main:app --host 0.0.0.0 --port 7860
