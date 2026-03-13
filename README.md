# Atlas

> Agentic AI Support System for Investment and Trading

Atlas is a multi-agent AI trading assistant that runs a full analysis pipeline on any stock ticker and lets you control how much authority the AI has over trade execution — from pure signals to fully autonomous trading.

## What Makes Atlas Different

Most retail AI trading tools are black boxes. Atlas shows its reasoning at every step and lets you set the execution boundary:

| Mode | Behaviour |
|------|-----------|
| **Advisory** | AI generates a signal — you execute manually |
| **Conditional** | AI proposes a trade — you approve before execution |
| **Autonomous** | AI executes automatically — you have an override window |

The trading logic is identical across all three modes. Only the execution authority changes.

## What's Built

### Agent Pipeline — fully operational

A LangGraph `StateGraph` runs three analysts in parallel, then fans in to synthesis, risk, and a final portfolio decision:

```
Market Data (yfinance: OHLCV, fundamentals, news)
    ↓
[Technical | Fundamental | Sentiment]  ← parallel
    ↓ fan-in
Synthesis → Risk → Portfolio Decision
    ↓
MongoDB Atlas  (full reasoning trace saved per run)
    ↓
Execution Boundary Controller → Broker (Alpaca paper)
```

All analyst and decision nodes are real implementations — no stubs. The risk agent is deterministic (2% portfolio risk rule, 2:1 R/R). All LLM calls use Gemini 2.5 Flash with structured JSON output.

### Execution Boundary Controller — fully operational

Three modes with different confidence thresholds (60% conditional, 65% autonomous). Advisory returns the signal only; Conditional marks it `awaiting_approval` until the user approves; Autonomous executes immediately.

### Broker Adapter — Alpaca paper trading connected

Protocol-based abstraction (`BrokerAdapter`) with a working `AlpacaAdapter`. Place market orders, fetch account equity/cash/positions. IBKR is a future implementation of the same protocol.

### Backend API — mostly live

| Endpoint | Status |
|----------|--------|
| `POST /v1/pipeline/run` | Live — full pipeline execution |
| `GET /v1/portfolio` | Live — real Alpaca account data |
| `GET /v1/signals` | Live — recent signals from MongoDB traces |
| `POST /v1/signals/{id}/approve` | Live — places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | Stub |
| `GET /v1/trades` | Stub — returns mock data |
| `POST /v1/trades/{id}/override` | Stub — Alpaca cancel not yet wired |

### Frontend Dashboard — functional, no auth

Three pages: landing, user dashboard (4 tabs — overview, signals, positions, settings), admin panel. The dashboard fetches live portfolio and signals from the backend. Signal approval is wired. Theme toggle (dark/light) working via `ThemeProvider`.

### Databases — schema deployed, partial usage

- **Supabase (PostgreSQL)** — 5 tables with RLS policies deployed. Not yet used by the app; state lives in Alpaca + MongoDB.
- **MongoDB Atlas** — `reasoning_traces` collection active. Receives a full document on every pipeline run. Powers the signals list.

## Monorepo Structure

| Folder | Deploys to | Purpose |
|--------|-----------|---------|
| [`frontend/`](./frontend/) | Vercel (UAT) | Next.js 16 dashboard |
| [`backend/`](./backend/) | Render (UAT) | FastAPI REST API |
| [`agents/`](./agents/) | Imported by backend | LangGraph pipeline |
| [`database/`](./database/) | Supabase + MongoDB Atlas | Schema definitions |
| [`docs/`](./docs/) | — | Architecture and context |

## Quick Start

```bash
# Backend
cd backend && uv sync && cp .env.example .env
uv run uvicorn main:app --reload   # → http://localhost:8000

# Frontend
cd frontend && npm install && cp .env.example .env.local
npm run dev                        # → http://localhost:3000
```

Run the pipeline directly:

```bash
curl -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "conditional"}'
```

## Tech Stack

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS v4
- **Backend** — FastAPI, Python 3.11+, uv, Docker (Render)
- **Agents** — LangGraph, Google Gemini 2.5 Flash (`google-genai`), yfinance
- **Databases** — Supabase (PostgreSQL + RLS) + MongoDB Atlas (reasoning traces)
- **Broker** — Alpaca paper trading (connected); IBKR planned for production

## UAT Deployments

| Service | URL |
|---------|-----|
| Backend | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend | `https://atlas-broker-frontend-uat.vercel.app` |

---

## What's Next

Five gaps remain before the product is complete enough for real use.

### 1. Override window not implemented
**Autonomous mode has no emergency brake.**
`POST /v1/trades/{id}/override` is a stub. When the AI executes a trade automatically, there is currently no way to cancel it.

Fix: wire the endpoint to call `broker.cancel_order(order_id)` and write to the Supabase `override_log` table. Until this is done, Autonomous mode should be used with caution.

### 2. Authentication not integrated
**Anyone with the URL can view the portfolio and approve trades.**
Supabase Auth is configured at the infrastructure level (env vars present, RLS policies deployed) but nothing in the frontend or backend uses it yet. There is no login page, no session, and no user context passed to the backend.

Fix: add Supabase Auth to the frontend (login/signup pages, session middleware, `useAuth` hook), pass the JWT to the backend, and have the backend extract `user_id` for Supabase RLS enforcement.

### 3. Execution mode not persisted
**User preference is forgotten on every page refresh.**
The Settings tab lets users pick advisory / conditional / autonomous, but the selection is stored only in local component state.

Fix: on selection, write to `profiles.boundary_mode` in Supabase; read it back on mount; use it as the default `boundary_mode` when calling `/v1/pipeline/run`.

### 4. Trade history not synced
**Supabase `trades` and `positions` tables are empty.**
Positions and account data come from Alpaca. Nothing writes to Supabase when a trade is executed, so there is no persistent history, audit trail, or basis for analytics.

Fix: when `approve_and_execute` places an order, write to `supabase.trades` and update `supabase.positions`. On `/v1/portfolio` fetch, optionally sync Alpaca state to Supabase.

### 5. Signal rejection is silent
**Conditional mode users can click Reject, but nothing happens.**
`POST /v1/signals/{id}/reject` returns a placeholder response and does not persist the decision anywhere.

Fix: log the rejection to the MongoDB trace document (`execution.rejected = true`) and return a confirmation the frontend can display.

---

## Academic Context

Capstone project BAC3004 at Singapore Institute of Technology (Applied Computing Fintech).
- Interim report: 12 April 2026
- Final report: 19 July 2026
