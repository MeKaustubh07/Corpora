# Implementation Plan — Multi-Tenant Multimodal Agentic RAG Platform

One project, built deep. Working name: **Corpora** (rename anytime).

**Pitch**: SaaS-style platform where each tenant uploads any knowledge (PDF, DOCX, Markdown, URLs, images, audio/video) and chats with an agentic pipeline that plans queries, retrieves via hybrid vector search, reranks, and answers with inline citations — with retrieval quality measured in CI, not vibes.

**Resume signals**: LangGraph multi-agent graph · Qdrant hybrid search (dense+sparse) · multimodal embeddings (CLIP) · ingestion pipeline with background workers · multi-tenancy · RAGAS eval gate in CI · Langfuse observability · SSE streaming · free-tier production deploy.

---

## Architecture

```
Browser ──> Next.js 15 (Vercel)
              │ Clerk JWT
              ▼
          FastAPI backend (HF Spaces docker / local compose)
              │
   ┌──────────┼────────────────────┐
   ▼          ▼                    ▼
Ingestion   LangGraph agent     Postgres (Neon)
ARQ + Redis  (SSE streaming)    tenants/collections/chats
   │          │
   ▼          ▼
Qdrant — hybrid index per tenant
  dense: bge-small-en-v1.5 (FastEmbed, local, free)
  sparse: BM25
  images: CLIP ViT-B/32 (separate vector space)
              │
              ▼
  Cross-encoder rerank (bge-reranker, ONNX)
              │
              ▼
  LLM answer + [n] citations ──> Langfuse traces
                                      │
                              RAGAS eval gate (CI)
```

## Repo Layout

```
Experiment/
├── PLAN.md
├── README.md                    # architecture diagram, decision log, metrics, demo link
├── .github/workflows/ci.yml     # ruff + mypy + pytest + RAGAS gate
├── docker-compose.yml           # qdrant + redis + postgres — full local stack
├── backend/                     # Python 3.11, uv
│   ├── app/
│   │   ├── main.py              # app factory, CORS, lifespan
│   │   ├── api/                 # routers: collections, documents, chat, jobs, health
│   │   ├── core/                # pydantic-settings config, Clerk JWT (JWKS), deps
│   │   ├── db/                  # SQLAlchemy models + Alembic migrations
│   │   ├── ingest/              # parsers, chunkers, embedders, ARQ workers
│   │   ├── agent/               # LangGraph: planner → retriever → reranker → answerer → verifier
│   │   ├── retrieval/           # Qdrant hybrid (RRF fusion), CLIP image search, reranker
│   │   └── observability/       # Langfuse setup
│   ├── tests/
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/                    # Next.js 15 App Router + Tailwind + shadcn/ui
│   └── src/app/                 # chat (streaming), collections, upload, citations panel
└── eval/                        # RAGAS suite + golden dataset
```

## Phases

**P0 — Scaffold** (no external deps)
uv backend project, Next.js app, docker-compose (qdrant/redis/postgres), ruff+mypy+pre-commit, CI skeleton, .env.example.

**P1 — Backend core**
Config; Clerk JWT middleware (JWKS verify, dev-mode bypass flag); multi-tenant schema: `tenants, users, collections, documents, ingest_jobs, chats, messages`; Alembic; health endpoints.

**P2 — Ingestion pipeline**
Upload/URL endpoints → ARQ job → parse (PyMuPDF, python-docx, markdown, trafilatura; faster-whisper for audio/video; images direct) → recursive+semantic chunking → embed (dense + BM25 sparse; CLIP for images) → tenant-scoped Qdrant upsert → job status endpoint with progress.

**P3 — LangGraph agent**
`query_planner` (rewrite/decompose) → `retriever` (hybrid RRF, optional image search) → `reranker` (cross-encoder top-8) → `answerer` (cited, inline [n]) → `verifier` (grounding check, one retry loop). SSE streaming. Chat memory in Postgres.

**P4 — Frontend**
Streaming chat, citation hover cards → source chunks, image results inline, collection CRUD, drag-drop upload + job progress, tenant switcher.

**P5 — Evals + observability**
Langfuse tracing per node. RAGAS (faithfulness, answer relevancy, context precision/recall) on golden dataset; CI fails under threshold. Latency histograms.

**P6 — Deploy (all free)**
Vercel (frontend) · HF Spaces docker (backend) · Qdrant Cloud 1GB · Neon · Upstash Redis · Clerk · Langfuse Cloud.

**P7 — Polish**
Root README: mermaid diagram, decision log (hybrid vs dense-only, RRF choice, chunking strategy), Locust load-test numbers, seeded demo tenant + demo dataset, screenshots/GIF.

## Testing

- Unit: chunkers, RRF fusion, citation extraction, zone-free logic
- Integration: API against docker services (pytest + httpx)
- Eval: RAGAS in CI on golden Q/A set
- Load: Locust report in README

## External Services (all free tier)

| Service | For | Needed by |
|---------|-----|-----------|
| LLM API — Groq (recommended) / Gemini / Anthropic | agent answers | P3 |
| Clerk | auth | P1 (dev keys) |
| Langfuse Cloud | tracing | P5 |
| Qdrant Cloud, Neon, Upstash | prod stores | P6 |
| Hugging Face token | backend hosting | P6 |
| Vercel | frontend hosting | P6 |

Local docker-compose covers everything until P6. Embeddings/reranker run locally (FastEmbed/ONNX) — zero cost, no key.
