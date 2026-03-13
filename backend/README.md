# Atlas — Backend

FastAPI REST API for the Atlas AI trading assistant.

## Stack

- **Framework** — FastAPI 0.115+
- **Language** — Python 3.11+
- **Package manager** — uv
- **Runtime** — Uvicorn (ASGI)
- **Containerisation** — Docker

## Getting Started

```bash
uv sync                                          # install dependencies
cp .env.example .env                             # fill in your values
uv run uvicorn main:app --reload                 # → http://localhost:8000
```

API docs available at `http://localhost:8000/docs` (Swagger UI).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `8000`) |
| `ENVIRONMENT` | No | `development` or `production` |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (never expose to frontend) |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | No | Database name (default: `atlas`) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `LLM_QUICK_MODEL` | No | Fast model ID (default: `gemini-2.0-flash-lite`) |
| `LLM_DEEP_MODEL` | No | Deep model ID (default: `gemini-2.0-flash-lite`) |
| `ALPACA_API_KEY` | Yes (Phase 4+) | Alpaca API key |
| `ALPACA_SECRET_KEY` | Yes (Phase 4+) | Alpaca secret key |
| `ALPACA_BASE_URL` | No | Alpaca base URL (default: paper trading endpoint) |
| `RENDER_EXTERNAL_URL` | Auto | Set by Render — enables keep-alive ping |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/signals` | Latest trade signals |
| `POST` | `/v1/signals/{id}/approve` | Approve a signal (Conditional mode) |
| `POST` | `/v1/signals/{id}/reject` | Reject a signal (Conditional mode) |
| `GET` | `/v1/portfolio` | Portfolio summary |
| `GET` | `/v1/trades` | Trade history |
| `POST` | `/v1/trades/{id}/override` | Override an executed trade (Autonomous mode) |

## Docker

```bash
docker build -t atlas-backend .
docker run -p 8000:8000 --env-file .env atlas-backend
```

## Deployment (Render)

1. New Web Service → connect repo → set root directory to `backend/`
2. Runtime: **Docker** (Render auto-detects the Dockerfile)
3. Add all environment variables from `.env.example`
4. `RENDER_EXTERNAL_URL` is set automatically by Render — the keep-alive task uses it to prevent the free tier from sleeping

## Commands

```bash
uv sync                          # install all dependencies
uv sync --no-dev                 # production install (no test deps)
uv run uvicorn main:app --reload # dev server
uv run pytest                    # run tests
uv add <package>                 # add a dependency
```
