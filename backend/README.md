# Atlas — Backend

FastAPI REST API for the Atlas AI trading assistant. Deployed on Render (UAT) via Docker.

![Backend Architecture](../docs/diagrams/backend-architecture.png)

## Stack

- **Framework** — FastAPI 0.115+
- **Language** — Python 3.11+
- **Package manager** — uv
- **Runtime** — Uvicorn (ASGI)
- **Containerisation** — Docker
- **Deployment** — Render (UAT)

## Structure

```
backend/
├── main.py                        # App entry point — mounts routers, middleware, keep-alive task
├── api/
│   ├── middleware/
│   │   ├── auth.py                # ClerkAuthMiddleware — JWT verification via JWKS
│   │   └── cors.py                # CORS config
│   └── routes/
│       ├── pipeline.py            # POST /v1/pipeline/run — full live pipeline
│       ├── signals.py             # GET /v1/signals, POST approve/reject
│       ├── portfolio.py           # GET /v1/portfolio — live Alpaca data
│       ├── trades.py              # GET /v1/trades, POST /v1/trades/{id}/override
│       └── backtest.py            # POST/GET/DELETE /v1/backtest — backtest job management
├── broker/
│   ├── base.py                    # BrokerAdapter Protocol
│   ├── alpaca.py                  # AlpacaAdapter — paper trading
│   └── factory.py                 # Returns correct broker from BROKER_TYPE env var
├── boundary/
│   ├── modes.py                   # BoundaryMode enum + per-mode confidence thresholds
│   └── controller.py              # ExecutionBoundaryController.execute()
├── db/
│   └── supabase.py                # Supabase client — trades, positions, profiles, override_log
├── backtesting/
│   ├── __init__.py
│   ├── runner.py                  # Background task: orchestrates full backtest run
│   ├── simulator.py               # VirtualPortfolio — cash, positions, P&L simulation
│   └── metrics.py                 # Sharpe, drawdown, win rate, signal-to-execution rate
└── services/
    ├── pipeline_service.py        # run_pipeline_with_ebc — agents → EBC → response
    ├── signals_service.py         # MongoDB queries; approve-and-execute with idempotency guard
    └── backtest_service.py        # Backtest job CRUD (Supabase) + results persistence (MongoDB)
```

`atlas-agents` (the `agents/` package) is installed as a local editable dependency.

## Authentication

All routes except `/health` and `/webhooks/clerk` require a valid Clerk JWT.

`ClerkAuthMiddleware` (`api/middleware/auth.py`):
- Extracts `Authorization: Bearer <token>` from every request
- Verifies the JWT against the instance-specific Clerk JWKS endpoint
- Sets `request.state.user_id` to the `sub` claim on success
- Returns `401` on missing or invalid tokens; `503` if JWKS is unreachable
- Passes `OPTIONS` requests through for CORS preflight

The JWKS URL is derived automatically from `CLERK_PUBLISHABLE_KEY` (decodes the base64 instance domain). Set `CLERK_JWKS_URL` explicitly to override.

## API Routes

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/health` | ✅ Live | Health check — returns status, version, env |
| `POST` | `/v1/pipeline/run` | ✅ Live | Runs the full agent pipeline for a ticker |
| `GET` | `/v1/signals` | ✅ Live | Fetches recent signals from MongoDB reasoning traces |
| `POST` | `/v1/signals/{id}/approve` | ✅ Live | Places Alpaca order; marks trace as executed (idempotent) |
| `POST` | `/v1/signals/{id}/reject` | ✅ Live | Persists rejection to MongoDB trace (`execution.rejected = true`) |
| `GET` | `/v1/portfolio` | ✅ Live | Returns live equity, cash, and positions from Alpaca |
| `GET` | `/v1/trades` | ✅ Live | Returns trade history from Supabase |
| `POST` | `/v1/trades/{id}/override` | ✅ Live | Cancels Alpaca order; writes to Supabase `override_log` |
| `POST` | `/v1/backtest` | ✅ Live | Create backtest job + start background task |
| `GET` | `/v1/backtest` | ✅ Live | List all backtest jobs for user |
| `GET` | `/v1/backtest/{id}` | ✅ Live | Job status + full results (polling target) |
| `DELETE` | `/v1/backtest/{id}` | ✅ Live | Delete job + MongoDB document |

### Run the Pipeline

```bash
curl -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-jwt>" \
  -d '{"ticker": "AAPL", "boundary_mode": "conditional"}'
```

Returns action, confidence, reasoning, risk parameters (stop-loss, take-profit, position size, R/R ratio), and a MongoDB trace ID.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `8000`) |
| `ENVIRONMENT` | No | `development` or `production` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `CLERK_PUBLISHABLE_KEY` | Yes* | Used to auto-derive JWKS URL |
| `CLERK_JWKS_URL` | Yes* | Instance JWKS endpoint — overrides auto-derivation |
| `CLERK_SECRET_KEY` | No | Clerk secret (used for webhook verification) |
| `CLERK_WEBHOOK_SECRET` | No | Webhook signing secret |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key — never expose to frontend |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | No | Database name (default: `atlas`) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `LLM_QUICK_MODEL` | No | Fast model (default: `gemini-2.5-flash`) |
| `LLM_DEEP_MODEL` | No | Deep model (default: `gemini-2.5-flash`) |
| `ALPACA_API_KEY` | Yes | Alpaca API key |
| `ALPACA_SECRET_KEY` | Yes | Alpaca secret key |
| `ALPACA_BASE_URL` | No | Defaults to paper trading endpoint |
| `BROKER_TYPE` | No | `alpaca` (default) — future: `ibkr` |
| `RENDER_EXTERNAL_URL` | Auto | Set by Render — used by the keep-alive ping task |
| `SCHEDULER_ENABLED` | No | `true` to activate daily 9:30 AM ET pipeline runs (default: `false`) |
| `SCHEDULER_TICKERS` | No | Comma-separated tickers for scheduled runs (e.g. `AAPL,MSFT,TSLA,NVDA,META`). Falls back to `WATCHLIST_TICKERS`. |
| `SCHEDULER_EBC_MODE` | No | Override boundary mode for all scheduled runs: `advisory` or `autonomous`. Defaults to per-user profile value. |
| `SCHEDULER_USER_ID` | No | Clerk user_id to attribute scheduled runs to (v1 single-user mode). When set, skips broker_connections lookup. |

*Either `CLERK_PUBLISHABLE_KEY` or `CLERK_JWKS_URL` must be set for auth to work.

## Getting Started

```bash
uv sync
cp .env.example .env
uv run uvicorn main:app --reload   # → http://localhost:8000
```

Swagger UI at `http://localhost:8000/docs` (available in development mode).

## Docker

```bash
docker build -t atlas-backend .
docker run -p 8000:8000 --env-file .env atlas-backend
```

## Deployment (Render)

1. New Web Service → connect repo → set root directory to `backend/`
2. Runtime: **Docker** (Render detects the Dockerfile automatically)
3. Add all env vars from `.env.example`
4. `RENDER_EXTERNAL_URL` is injected by Render; the keep-alive task uses it to prevent free-tier sleep

UAT: `https://atlas-broker-backend-uat.onrender.com`

## Commands

```bash
uv sync                              # install all dependencies
uv sync --no-dev                     # production install
uv run uvicorn main:app --reload     # dev server
uv run pytest                        # run tests
uv add <package>                     # add a dependency
```
