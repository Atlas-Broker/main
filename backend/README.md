# Atlas — Backend

FastAPI REST API for the Atlas AI trading assistant. Deployed on Render (UAT) via Docker.

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
├── main.py                        # App entry point — mounts routers, CORS middleware, keep-alive task
├── api/
│   ├── middleware/cors.py          # CORS config
│   └── routes/
│       ├── pipeline.py            # POST /v1/pipeline/run — full live pipeline
│       ├── signals.py             # GET /v1/signals, POST approve/reject
│       ├── portfolio.py           # GET /v1/portfolio — live Alpaca data
│       └── trades.py              # GET /v1/trades, POST /v1/trades/{id}/override
├── broker/
│   ├── base.py                    # BrokerAdapter Protocol
│   ├── alpaca.py                  # AlpacaAdapter — paper trading
│   └── factory.py                 # Returns correct broker from BROKER_TYPE env var
├── boundary/
│   ├── modes.py                   # BoundaryMode enum + per-mode confidence thresholds
│   └── controller.py              # ExecutionBoundaryController.execute()
└── services/
    ├── pipeline_service.py        # run_pipeline_with_ebc — agents → EBC → response
    └── signals_service.py         # MongoDB queries; approve-and-execute with idempotency guard
```

`atlas-agents` (the `agents/` package) is installed as a local editable dependency.

## API Routes

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/health` | Live | Health check — returns status, version, env |
| `POST` | `/v1/pipeline/run` | Live | Runs the full agent pipeline for a ticker |
| `GET` | `/v1/signals` | Live | Fetches recent signals from MongoDB reasoning traces |
| `POST` | `/v1/signals/{id}/approve` | Live | Places Alpaca order; marks trace as executed (idempotent) |
| `POST` | `/v1/signals/{id}/reject` | Stub | Returns placeholder response — not yet persisted |
| `GET` | `/v1/portfolio` | Live | Returns live account equity, cash, and open positions from Alpaca |
| `GET` | `/v1/trades` | Stub | Returns hardcoded mock trades |
| `POST` | `/v1/trades/{id}/override` | Stub | Returns placeholder — Alpaca cancel not yet wired |

### Run the Pipeline

```bash
curl -X POST http://localhost:8000/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "boundary_mode": "conditional"}'
```

Returns an AI-generated signal with action, confidence, reasoning, full risk parameters (stop-loss, take-profit, position size, R/R ratio), and a MongoDB trace ID.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `8000`) |
| `ENVIRONMENT` | No | `development` or `production` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
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

## Getting Started

```bash
uv sync
cp .env.example .env
uv run uvicorn main:app --reload   # → http://localhost:8000
```

Swagger UI at `http://localhost:8000/docs`.

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
