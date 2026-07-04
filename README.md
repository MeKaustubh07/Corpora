# Corpora — Multi-Tenant Multimodal Agentic RAG Platform

Upload any knowledge — PDFs, DOCX, Markdown, URLs, images — and chat with an
agentic pipeline that plans queries, retrieves with hybrid vector search,
reranks with a cross-encoder, and streams answers with inline citations.
Retrieval quality is **measured in CI**, not assumed.

**Stack**: FastAPI · LangGraph · Qdrant (hybrid dense+sparse) · FastEmbed ·
CLIP · Groq (Llama 3.3 70B) · ARQ + Redis · PostgreSQL · Next.js 15 · Langfuse

## Architecture

```mermaid
flowchart TD
    B[Browser — Next.js] -->|Clerk JWT| API[FastAPI]
    API --> ING[Ingestion — ARQ workers]
    API --> AG[LangGraph agent]
    API --> PG[(PostgreSQL<br/>tenants · docs · chats)]
    ING -->|parse → chunk → embed| Q[(Qdrant<br/>dense bge-small + BM25 sparse<br/>CLIP image space)]
    AG -->|planner| AG2[hybrid retrieve<br/>RRF fusion] --> AG3[cross-encoder<br/>rerank top-8] --> AG4[cited answer<br/>SSE stream] --> AG5[grounding verifier<br/>retry ≤1]
    AG2 --> Q
    AG4 -->|traces| LF[Langfuse]
```

### Agent graph

`planner` decomposes the question into 1-3 search queries → `retrieve` runs
hybrid search per query (dense + BM25, fused with Reciprocal Rank Fusion,
deduped) → `rerank` scores candidates with a cross-encoder and keeps top-8 →
`answer` streams a response citing sources inline `[n]` → `verify` judges
grounding and triggers one stricter retry if unsupported claims slip in.

## Quality gate (CI)

Every push runs a golden-dataset eval ([eval/golden.json](eval/golden.json))
through the full pipeline — ingest → agent → judge:

| Metric | How | Gate | Current |
|--------|-----|------|---------|
| Retrieval hit-rate | expected fact present in retrieved chunks (deterministic) | ≥ 0.80 | **1.00** |
| Faithfulness | LLM judge: answer supported by context | ≥ 0.70 | **1.00** |
| Answer relevancy | LLM judge: answer addresses question | ≥ 0.70 | **1.00** |

## Decision log

- **Hybrid over dense-only** — BM25 sparse catches exact identifiers (error
  codes, prices, names) that dense embeddings blur; RRF fuses without score
  calibration headaches.
- **Cross-encoder rerank** — bi-encoder retrieval optimizes recall; the
  cross-encoder re-scores query+chunk jointly for precision on the top-8 that
  actually enter the prompt.
- **Custom LLM-judge eval instead of RAGAS** — RAGAS fires many judge calls
  per sample; Groq free tier rate-limits made a 2-call/sample judge with the
  same metric semantics (faithfulness, answer relevancy) the pragmatic gate.
- **Verifier fails open** — a broken judge must never block user answers;
  grounding check adds a retry, not a gate.
- **Tenant isolation at the vector layer** — every Qdrant point carries
  `tenant_id` and every query filters on it, so an API-layer bug can't leak
  another tenant's chunks.
- **Assistant messages persist on client disconnect** — SSE generator saves
  accumulated tokens in a cancellation-shielded `finally`.

## Run locally

```bash
docker compose up -d                # qdrant + redis + postgres
cp .env.example .env                # add GROQ_API_KEY

cd backend
uv sync
uv run alembic upgrade head
uv run arq app.ingest.worker.WorkerSettings &   # ingestion worker
uv run uvicorn app.main:app --port 8000 &       # API

cd ../frontend
npm install && npm run dev          # http://localhost:3000
```

Tests: `uv run pytest -m "not slow and not eval"` (fast) ·
`-m slow` (e2e ingest+agent) · `-m eval` (quality gate).

## Repo map

```
backend/app/agent/      LangGraph nodes + graph
backend/app/ingest/     parsers, chunking, embeddings, ARQ worker
backend/app/retrieval/  Qdrant hybrid search (RRF), cross-encoder reranker
backend/app/api/        collections, documents, chat (SSE)
frontend/src/           Next.js UI — collections, upload, streaming chat
eval/                   golden dataset + corpus (gate wired into CI)
```
