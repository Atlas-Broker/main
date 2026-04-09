# Atlas

> Agentic AI Support System for Investment and Trading

Atlas is a multi-agent AI trading assistant that runs a full analysis pipeline on any stock ticker and lets you control how much authority the AI has over trade execution — from pure signals to fully autonomous trading.

![Atlas System Architecture](docs/diagrams/atlas-system-architecture.png)

## What Makes Atlas Different

Most retail AI trading tools are black boxes. Atlas shows its reasoning at every step and lets you set the execution boundary:

| Mode | Behaviour |
|------|-----------|
| **Advisory** | AI generates signals — you execute manually. Full reasoning on every signal. |
| **Autonomous** | AI executes automatically within your risk limits. 5-minute override window on every trade. |

The trading logic is identical across both modes. Only the execution authority changes.

## What's Built

### Agent Pipeline — fully operational

A LangGraph `StateGraph` runs three analysts in parallel, then fans in to synthesis, account fetch, risk, and a final portfolio decision:

```
Market Data (yfinance: OHLCV, fundamentals, news)
    ↓
[Technical | Fundamental | Sentiment]  ← parallel
    ↓ fan-in
Synthesis → fetch_account → Risk → Portfolio Decision
    ↓
MongoDB Atlas  (full reasoning trace saved per run)
    ↓
Execution Boundary Controller → Broker (Alpaca paper)
```

All analyst and decision nodes are real implementations — no stubs. The risk agent is deterministic (2% portfolio risk rule, 2:1 R/R) and sizes positions using real account buying power (live) or virtual portfolio cash (backtest). The portfolio agent sees all current positions, not just the ticker being analyzed. All LLM calls use Gemini 2.5 Flash with structured JSON output.

### Execution Boundary Controller — fully operational

Three modes with confidence thresholds (60% conditional, 65% autonomous). Before each autonomous execution, stale open orders for the ticker are cancelled on Alpaca. Advisory returns the signal only; Conditional marks it `awaiting_approval`; Autonomous executes immediately and opens an override window.

### Backtest / Live Trading Isolation

In backtest mode (`as_of_date` set), the graph never calls Alpaca's trading client — no live positions fetch, no order placement. Virtual portfolio state (cash + positions) is pre-seeded into the graph before each day's pipeline calls. Alpaca News API is still used (with date-bounded params) for sentiment look-ahead prevention. Live runs use real per-user Alpaca credentials.

### Authentication — Clerk JWT

Login at `/login` via Clerk. The backend validates every request with `ClerkAuthMiddleware`, verifying JWTs against the instance-specific JWKS endpoint. Unauthenticated requests return `401`.

### Backend API — fully live

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /v1/pipeline/run` | Full pipeline execution |
| `GET /v1/portfolio` | Real Alpaca account data + Supabase metadata |
| `GET /v1/portfolio/equity-curve` | Historical equity curve from Alpaca |
| `GET /v1/signals` | Recent signals from MongoDB traces |
| `POST /v1/signals/{id}/approve` | Places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | Persists rejection to MongoDB trace |
| `GET /v1/trades` | Trade history from Supabase |
| `POST /v1/trades/{id}/override` | Cancels Alpaca order, writes to `override_log` |
| `GET /v1/watchlist` | User's watchlist with per-ticker scan frequency |
| `PUT /v1/watchlist` | Replace watchlist; validates ticker + schedule (`1x`/`3x`/`6x`) |
| `POST /v1/backtest` | Create backtest job — real Gemini pipeline, async |
| `GET /v1/backtest` | List backtest jobs for user |
| `GET /v1/backtest/{id}` | Job status + full results (polling target) |
| `DELETE /v1/backtest/{id}` | Delete job + MongoDB results |
| `POST /v1/backtest/{id}/cancel` | Cancel a running job |
| `POST /v1/backtest/{id}/resume` | Resume a failed/cancelled job from its last checkpoint |
| `GET /v1/scheduler/status` | Next scheduler scan window |
| `GET /v1/profile` | User profile |
| `PATCH /v1/profile` | Update boundary_mode / philosophy / display_name |

### Scheduler — multi-window, always on

Up to 6 ET scan windows per day (06:30, 09:30, 12:00, 13:30, 15:00, 16:30). Per-user schedule frequency (`1x`/`3x`/`6x`) is stored in Supabase `watchlist` and read at each window. Always starts on app startup — no `SCHEDULER_ENABLED` env var needed.

### Backtesting Engine — fully operational with checkpoint/resume

Replays the real AI pipeline (live Gemini calls) across historical date ranges and multiple tickers. Simulates trade execution in a virtual portfolio without touching Alpaca. After each trading day, a checkpoint is saved; failed or cancelled jobs can be resumed with `POST /v1/backtest/{id}/resume` without restarting from day 1.

Key design decisions:
- `as_of_date` constrains yfinance price/fundamental data to the historical date — no look-ahead bias
- News fetched from Alpaca News API with date-bounded params
- $10,000 shared capital pool; position sizing from risk agent (capped at `buying_power × 0.95`)
- Virtual portfolio state pre-seeded into graph so portfolio agent reasons over all positions each day

Metrics computed: cumulative return, Sharpe ratio (annualised), max drawdown, win rate, signal-to-execution rate, per-ticker contribution.

### Frontend Dashboard — authenticated

Six pages: landing (`/`), pricing (`/pricing`), login (`/login`), user dashboard (`/dashboard`, 5 tabs), admin panel (`/admin`), and design system (`/design-system`). Auth gated via Clerk. Light theme; manual dark mode toggle. Pricing shows Free/Pro/Max with annual/monthly toggle. Dashboard settings tab includes watchlist editor (per-ticker scan frequency, persisted to Supabase).

Key UX features:
- **Agent Logs** — Grouped by scan window with BUY/SELL/HOLD badges. Pastel colors for agent recommendations, solid colors for trades executed on Alpaca. Shows recommended shares and price per signal.
- **AI Decision Log** — Per-ticker lean row-based log with dual timezone (SGT local + US Eastern), shares/price from risk analysis, and pastel vs solid execution coloring.
- **Equity Curve** — Chart.js line chart (0 to max, touch-friendly tooltips), live portfolio value appended as today's data point, current holdings breakdown with per-position PnL, cash balance, and total.

### Databases — both active

- **MongoDB Atlas** — `reasoning_traces` (every pipeline run) and `backtest_results` (full daily runs, equity curve, checkpoint, metrics)
- **Supabase (PostgreSQL)** — 7 tables with RLS: `profiles`, `portfolios`, `positions`, `trades`, `override_log`, `backtest_jobs`, `watchlist`

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
  -H "Authorization: Bearer <clerk-jwt>" \
  -d '{"ticker": "AAPL", "boundary_mode": "conditional"}'
```

## Tech Stack

- **Frontend** — Next.js 16, TypeScript, Tailwind CSS v4, Clerk
- **Backend** — FastAPI, Python 3.11+, uv, Docker (Render)
- **Agents** — LangGraph, Google Gemini 2.5 Flash (`google-genai`), yfinance
- **Databases** — Supabase (PostgreSQL + RLS) + MongoDB Atlas (reasoning traces)
- **Auth** — Clerk (frontend session + JWT) + ClerkAuthMiddleware (backend verification)
- **Broker** — Alpaca paper trading (connected); IBKR planned for production

## UAT Deployments

| Service | URL |
|---------|-----|
| Backend | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend | `https://atlas-broker-frontend-uat.vercel.app` |

---

## Academic Context

Capstone project BAC3004 at Singapore Institute of Technology (Applied Computing Fintech).
- Interim report: 12 April 2026
- Final report: 19 July 2026
