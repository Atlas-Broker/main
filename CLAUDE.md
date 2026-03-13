# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Atlas** — Agentic AI Support System for Investment and Trading. Capstone project (BAC3004, SIT) + real B2C product. Full context in `docs/ATLAS_CONTEXT.md`.

## Monorepo Structure

| Folder | Deployment | Purpose |
|--------|-----------|---------|
| `frontend/` | Vercel | Next.js 16 dashboard (App Router, TypeScript, Tailwind) |
| `backend/` | Render (Docker) | FastAPI REST API (Python 3.11+, uv) |
| `agents/` | Imported by backend | LangGraph multi-agent pipeline |
| `database/` | — | Supabase schema + MongoDB schemas (shared) |
| `docs/` | — | Architecture, context, plans |

## Commands

### Frontend
```bash
cd frontend
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # ESLint
```

### Backend
```bash
cd backend
uv sync              # install deps + create .venv
uv run uvicorn main:app --reload   # dev server on :8000
uv run pytest        # run tests
```

### Docker (backend)
```bash
cd backend
docker build -t atlas-backend .
docker run -p 8000:8000 --env-file .env atlas-backend
```

## Architecture

### Agent Pipeline
`Market Data → [Technical | Fundamental | Sentiment] (parallel) → Synthesis → Risk → Portfolio Decision → Execution Boundary Controller → Broker Adapter`

### Execution Boundary Controller
The core differentiator. Three modes (same trading logic, different execution authority):
- **Advisory** — AI signals only, human executes manually
- **Conditional** — AI proposes, human must approve before execution
- **Autonomous** — AI executes, human has override window

### Databases
- **Supabase (PostgreSQL)** — users, portfolios, positions, trades, override_log. RLS enabled, `user_id` on every table.
- **MongoDB Atlas** — agent reasoning traces (nested, variable-structure documents). Schema in `database/mongo/schemas/`.

### LLM Strategy
- Quick-think (Gemini Flash): data retrieval, initial scanning
- Deep-think (Gemini Pro): synthesis, final decisions
- Factory pattern in `agents/llm/factory.py` — never call Gemini directly

### Broker Abstraction
`backend/broker/` has a `BrokerAdapter` protocol. Alpaca (paper) and IBKR (production) are swappable implementations. Never call broker APIs directly outside this module.

## Key Conventions

- All API routes are versioned under `/v1/`
- FastAPI auto-generates OpenAPI docs at `/docs`
- Frontend env vars are prefixed `NEXT_PUBLIC_` (only for non-sensitive values)
- `SUPABASE_SERVICE_KEY` is backend-only — never expose to frontend
- Stubs marked `# TODO (Phase N):` indicate planned implementation phases

## Deadlines
- Interim report: 12 April 2026
- Final report: 19 July 2026
