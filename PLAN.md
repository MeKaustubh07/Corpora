# Implementation Plan — AI Full-Stack Portfolio (Monorepo)

Two production-grade projects in one repo:

| # | Project | Codename | Core Signal |
|---|---------|----------|-------------|
| 1 | Multi-Tenant Agentic RAG Platform | `rag-platform/` | LangGraph agents, hybrid retrieval, evals, multi-tenancy |
| 2 | Real-Time CV Safety Monitor | `vision-monitor/` | YOLO11 + tracking, WebSocket streaming, Ray Serve, quantization |

---

## Repo Layout

```
Experiment/
├── PLAN.md                      # this file
├── README.md                    # portfolio landing: diagrams, links, metrics
├── .github/workflows/
│   ├── rag-ci.yml               # lint, tests, RAGAS eval gate
│   └── vision-ci.yml            # lint, tests, latency benchmark
├── rag-platform/
│   ├── backend/                 # FastAPI + LangGraph (Python 3.11, uv)
│   │   ├── app/
│   │   │   ├── main.py          # app factory, CORS, lifespan
│   │   │   ├── api/             # routers: auth, collections, documents, chat, health
│   │   │   ├── core/            # config (pydantic-settings), security (Clerk JWT), deps
│   │   │   ├── db/              # SQLAlchemy models + Alembic migrations
│   │   │   ├── ingest/          # parsers, chunkers, embedders, queue workers (ARQ)
│   │   │   ├── agent/           # LangGraph graph: planner → retriever → reranker → answerer
│   │   │   ├── retrieval/       # Qdrant hybrid search (dense + BM25 sparse), reranker
│   │   │   └── observability/   # Langfuse tracing setup
│   │   ├── tests/
│   │   └── Dockerfile
│   ├── frontend/                # Next.js 15 App Router + Tailwind + shadcn/ui
│   │   └── src/app/             # chat UI (SSE streaming), collections, upload, citations panel
│   ├── eval/                    # RAGAS suite + golden dataset (JSON)
│   └── docker-compose.yml       # qdrant, redis, postgres — full local stack
└── vision-monitor/
    ├── backend/                 # FastAPI + Ultralytics YOLO11 + ByteTrack (supervision)
    │   ├── app/
    │   │   ├── main.py
    │   │   ├── pipeline/        # detect → track → zone logic → events
    │   │   ├── streams/         # sources: video file, RTSP, YouTube (yt-dlp)
    │   │   ├── serve/           # Ray Serve deployment graph, ONNX INT8 path
    │   │   ├── ws/              # WebSocket: annotated frames + JSON events out
    │   │   └── alerts/          # rules engine + webhook dispatch
    │   ├── benchmarks/          # latency/FPS harness (pytorch vs ONNX vs INT8)
    │   ├── tests/
    │   └── Dockerfile
    ├── frontend/                # Next.js dashboard: live view, zone editor, event log, charts
    └── docker-compose.yml
```

---

## Project 1 — Agentic RAG Platform

### Architecture

```
Browser ──> Next.js (Vercel)
              │ Clerk JWT
              ▼
          FastAPI (HF Spaces / local docker)
              │
   ┌──────────┼───────────────┐
   ▼          ▼               ▼
Ingestion   LangGraph      Postgres (Neon)
(ARQ+Redis)  Agent          tenants/chats/docs
   │          │
   ▼          ▼
Qdrant hybrid (dense FastEmbed bge-small + sparse BM25)
              │
              ▼
        Cross-encoder rerank (bge-reranker ONNX)
              │
              ▼
        LLM answer + citations (SSE stream)
              │
              ▼
        Langfuse traces ── RAGAS eval gate in CI
```

### Phases

**P0 — Scaffold (no external deps)**
- Monorepo bootstrap, `uv` Python project, Next.js app, docker-compose (qdrant + redis + postgres), pre-commit (ruff, mypy), CI skeleton.

**P1 — Backend core**
- Pydantic-settings config; Clerk JWT verification middleware (JWKS); multi-tenant Postgres schema: `tenants, users, collections, documents, chunks_meta, chats, messages`; Alembic migrations; health/readiness endpoints.

**P2 — Ingestion pipeline**
- Upload endpoint → ARQ background job: parse (PyMuPDF for PDF, python-docx, markdown, trafilatura for URLs; faster-whisper for audio/video) → recursive+semantic chunking → dual embedding (FastEmbed dense `bge-small-en-v1.5` + Qdrant BM25 sparse) → upsert with tenant-scoped payload filters. Job status polling endpoint.

**P3 — LangGraph agent**
- Graph nodes: `query_planner` (decompose/rewrite) → `retriever` (Qdrant hybrid, RRF fusion) → `reranker` (cross-encoder top-8) → `answerer` (cited answer, inline `[n]` markers) → `verifier` (grounding check, optional retry loop). Streaming via SSE. Conversation memory in Postgres.

**P4 — Frontend**
- Chat with token streaming, citation hover cards linking to source chunks, collection CRUD, drag-drop upload with job progress, tenant switcher. shadcn/ui + Tailwind.

**P5 — Evals + observability**
- Langfuse tracing on every graph node. RAGAS metrics (faithfulness, answer relevancy, context precision/recall) over golden dataset; CI fails if faithfulness < threshold. Latency histograms.

**P6 — Deploy (all free)**
- Frontend → Vercel. Backend → HF Spaces (Docker). Qdrant Cloud free 1GB. Neon Postgres. Upstash Redis. Clerk free. Langfuse Cloud free.

**P7 — Polish**
- README with architecture diagram (mermaid), decision log ("why hybrid over dense-only", "why RRF"), Locust load test numbers, demo dataset + seeded demo tenant.

---

## Project 2 — Real-Time CV Safety Monitor

### Architecture

```
Video source (file / RTSP / YouTube)
      ▼
Frame grabber (OpenCV, adaptive sampling)
      ▼
Ray Serve graph: YOLO11n detect (ONNX INT8) → ByteTrack IDs
      ▼
Zone engine: intrusion, line-cross counts, dwell time, PPE-missing
      ▼                        ▼
WebSocket out                Event store (SQLite→Neon) + webhook alerts
(annotated JPEG + JSON)
      ▼
Next.js dashboard: live canvas, zone editor, event log, FPS/latency charts
```

### Phases

**P0 — Scaffold** — uv project, Next.js app, docker-compose, CI.

**P1 — Inference core** — YOLO11n via Ultralytics + `supervision` ByteTrack; polygon zone engine (intrusion, line crossing, dwell); pure-python testable event logic.

**P2 — Streaming layer** — source adapters (uploaded video, RTSP URL, YouTube via yt-dlp); FastAPI WebSocket pushing annotated JPEG frames + event JSON; backpressure via frame skip.

**P3 — Ray Serve + optimization** — Serve deployment graph with autoscaling replicas + dynamic batching; export ONNX, INT8 quantize; benchmark harness → report table (PyTorch fp32 vs ONNX vs INT8: ms/frame, FPS).

**P4 — Dashboard** — live view canvas, draw-your-own zone editor (SVG polygons persisted to backend), event feed, per-zone count charts (recharts), latency/FPS stats.

**P5 — Alerts + persistence** — rules (zone + class + duration), webhook dispatch (Discord/Slack URL), event history API.

**P6 — Deploy** — backend HF Spaces (ZeroGPU quota; CPU fallback with YOLO11n INT8), dashboard Vercel, demo runs on bundled sample videos + public streams.

**P7 — Polish** — README, benchmark tables, demo GIF, decision log.

---

## Cross-Cutting (both projects)

- **CI**: GitHub Actions — ruff + mypy + pytest; RAG adds RAGAS gate; vision adds benchmark artifact.
- **Testing**: unit (chunkers, zone engine), integration (API + docker services), eval (RAGAS).
- **Config**: 12-factor, `.env.example` committed, secrets never committed.
- **Docs**: each project self-contained README; root README = portfolio page.

## Build Order

1. RAG P0→P7 first (fully local-testable via docker-compose, no GPU needed)
2. Vision P0→P7
3. Deploys last, after keys provided

## External Services (all free tier)

| Service | Used for | Needed by |
|---------|----------|-----------|
| LLM API (Groq / Gemini / Anthropic) | RAG answers | RAG P3 |
| Qdrant Cloud 1GB | prod vectors (local docker until then) | RAG P6 |
| Neon Postgres | prod DB | RAG P6 |
| Clerk | auth | RAG P1 (dev keys) |
| Upstash Redis | prod queue/cache | RAG P6 |
| Langfuse Cloud | tracing | RAG P5 |
| HF account + token | backend hosting, ZeroGPU | P6 both |
| Vercel account | frontends | P6 both |
