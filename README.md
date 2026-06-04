# DataWeave-AI

DataWeave-AI is a full-stack, agentic knowledge system for **uploading PDFs and chatting with them**. A LangChain **ReAct agent** answers questions with verifiable page citations by combining semantic search, structured table queries, and deterministic math — backed by a hosted vector database, user authentication, and persistent chat history. The entire stack runs on **free tiers**.

> **Try it as a guest:** open `/guest` — no sign-up required. A demo session spins up instantly with sample data, perfect for a quick look.

---

## Architecture

```
   Browser
      │
      ▼
 ┌─────────────┐   NEXT_PUBLIC_API_URL    ┌────────────────────────┐
 │   Vercel    │ ───────────────────────► │  Hugging Face Spaces   │
 │ (Next.js 14)│   POST /upload, /query   │   (FastAPI, Docker)    │
 └─────┬───────┘                          └───────────┬────────────┘
       │ auth + chat history                          │ embed + retrieve
       ▼                                               ▼
 ┌─────────────┐                          ┌────────────────────────┐
 │  Supabase   │                          │     Qdrant Cloud        │
 │ (Postgres + │                          │  (vector index, RLS-    │
 │  Auth + RLS)│                          │   free, per-PDF scoped) │
 └─────────────┘                          └───────────┬────────────┘
                                                       │ LLM calls
                                                       ▼
                                            ┌────────────────────────┐
                                            │  OpenRouter (free LLMs, │
                                            │  automatic fallback)    │
                                            └────────────────────────┘
```

The backend container is **stateless** — the vector index lives in Qdrant Cloud and chat history in Supabase, so it can restart or scale to zero without losing data.

---

## Features

### Document intelligence
- **ETL pipeline** — text extraction with `pdfplumber` and table extraction with `camelot` (Ghostscript), parallelized across candidate pages for speed.
- **Hosted vector search** — chunks are embedded with `all-MiniLM-L6-v2` (sentence-transformers) and stored in **Qdrant Cloud**.
- **Per-PDF scoping** — each chunk is tagged with its `pdf_id`; queries are filtered so answers come **only** from the selected document.

### Agentic querying
- **ReAct agent** (LangChain) that orchestrates three tools: **SemanticSearch**, **TableQuery** (pandas over extracted tables), and a deterministic **MathTool**.
- **Verifiable citations** — every answer cites `[Page N]`; clicking a source reveals the underlying passage.
- **Reference chips** — mention specific pages to narrow the next question.
- **Transparent reasoning** — the full reasoning trace is returned and viewable per answer.
- **Free LLMs with automatic fallback** — uses OpenRouter `:free` models and falls through an ordered list if one is rate-limited or unavailable, so it stays $0 with no code change.

### Accounts & history
- **Supabase authentication** — email/password sign-up and login with persistent sessions and route guards (auth pages blocked when logged in, app routes blocked when logged out).
- **Guest mode (`/guest`)** — zero-friction, self-provisioning demo account for recruiters/first-time visitors; session tears down on exit.
- **Chat history** — conversations persist to Supabase (Row Level Security keeps them per-user); the **5 most recent conversations are cached in the browser** for instant load and refreshed on every new message.

### Storage management
- **Memory guard** — after each upload, the backend reads Qdrant's live memory and **auto-evicts the oldest documents** (LRU) when usage approaches the free-tier 1 GB limit.
- **Storage meter** — the sidebar shows live usage as a horizontal bar (turns red near the limit), backed by a `GET /storage` endpoint.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), React 18, Framer Motion, Lucide icons, react-markdown |
| Backend | FastAPI, LangChain (ReAct), sentence-transformers, pdfplumber, camelot |
| Vector DB | Qdrant Cloud |
| Auth + history | Supabase (Postgres, Auth, RLS) via `@supabase/ssr` |
| LLM | OpenRouter (free models, auto-fallback) |
| Hosting | Vercel (frontend) · Hugging Face Spaces / Docker (backend) |

---

## Project structure

- **[`backend/`](./backend)** — FastAPI server, ETL, indexing, ReAct agent, tools, `Dockerfile`. Source of truth for the backend.
- **[`frontend/`](./frontend)** — Next.js app: chat UI, auth pages, guest flow, sidebar, Supabase client + middleware.
- **[`supabase/schema.sql`](./supabase/schema.sql)** — chat-history tables, RLS policies, and demo-account seed (run once in the Supabase SQL editor).

---

## Getting started (local)

### Backend
```bash
cd backend
pip install -r requirements.txt
# CPU-only torch (avoids the large CUDA wheel):
pip install torch --index-url https://download.pytorch.org/whl/cpu

cp .env.example .env   # then fill in API_KEY, QDRANT_URL, QDRANT_API_KEY
python -m etl.run_etl --pdf data/your.pdf   # extract
python -m indexing.run_indexing             # index into Qdrant
python -m uvicorn api.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL + Supabase URL/anon key + demo creds
npm run dev                  # http://localhost:3000
```

First-time Supabase setup: run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor, and turn **off** email confirmation (Authentication → Providers → Email) so sign-ups and the guest flow work instantly.

---

## Configuration

**Backend** (`backend/.env`): `API_KEY` (OpenRouter), `QDRANT_URL` (include `:6333`), `QDRANT_API_KEY`, `ALLOWED_ORIGINS` (your frontend origin); optional `MODEL`/`FALLBACK_MODELS`, memory-guard thresholds (`QDRANT_MEM_HIGH_MB`, etc.). See `backend/.env.example`.

**Frontend** (`frontend/.env.local`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_DEMO_PASSWORD`. See `frontend/.env.example`.

---

## Deployment (free tier)

- **Frontend → Vercel**: import the repo, set Root Directory to `frontend`, add the `NEXT_PUBLIC_*` env vars.
- **Backend → Hugging Face Spaces (Docker)**: push the backend code (Dockerfile at the Space root, `sdk: docker`, `app_port: 7860`); set `API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `ALLOWED_ORIGINS` as Space secrets.
- **Vector DB → Qdrant Cloud** and **Auth/history → Supabase**: both free tiers.

---

## Known limitations

- **Documents are shared across users** — auth scopes *chat history* per user, but uploaded PDFs live in one shared Qdrant collection (no per-user document isolation yet).
- **Free LLMs are variable** — `:free` OpenRouter models can be rate-limited or occasionally weaker at strict ReAct formatting; the fallback chain mitigates this.
- **Guest "terminate on exit"** is best-effort (browser `pagehide`), and guest chats are kept browser-local to keep the shared demo account clean.
