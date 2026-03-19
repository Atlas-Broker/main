# Atlas — Progress Log

> What has been built and validated as of 19 March 2026.

---

## Agent Pipeline

**Status: Fully operational.**

LangGraph `StateGraph` running three analyst agents in parallel (fan-out), fanning in to synthesis, risk, and portfolio decision. All nodes are real implementations. All LLM calls use Gemini 2.5 Flash with structured JSON output (`response_mime_type="application/json"`). Latency tracked per node.

```
Market Data (yfinance: 90-day OHLCV, fundamentals, news)
    ↓
[Technical | Fundamental | Sentiment]  ← parallel via LangGraph
    ↓ fan-in
Synthesis (bull/bear debate) → Risk (2% rule, 2:1 R/R) → Portfolio Decision
    ↓
MongoDB Atlas (full reasoning trace per run)
    ↓
Execution Boundary Controller → Alpaca paper trading
```

Agents implemented:
- **Technical Analyst** — RSI, 20/50-day SMA, price change %, volume trend → Gemini structured signal
- **Fundamental Analyst** — P/E, EPS growth, debt/equity, analyst targets → Gemini structured signal
- **Sentiment Analyst** — News headline tone, key themes → Gemini sentiment score
- **Synthesis Agent** — Bull case + bear case → unified trade thesis with confidence weighting
- **Risk Agent** — Deterministic: 2% portfolio risk rule, stop-loss from support or 5% fixed, 2:1 R/R take-profit
- **Portfolio Decision Agent** — Final BUY/SELL/HOLD + confidence score (0–1)

---

## Execution Boundary Controller

**Status: All three modes operational, override window wired.**

| Mode | Confidence Threshold | Behaviour |
|------|---------------------|-----------|
| Advisory | N/A | Returns signal only — human executes manually |
| Conditional | ≥ 60% | Marks signal `awaiting_approval` — human must approve |
| Autonomous | ≥ 65% | Executes immediately — user has override window to cancel |

The override window calls `POST /v1/trades/{id}/override`, which:
1. Cancels the Alpaca order via `broker.cancel_order(order_id)`
2. Writes an audit record to Supabase `override_log`
3. Returns confirmation to the frontend

---

## Broker Adapter

**Status: Alpaca paper trading connected.**

Protocol-based `BrokerAdapter` with a working `AlpacaAdapter`. Places market orders, fetches account equity, cash, and open positions. IBKR is a future implementation of the same protocol.

---

## Backend API

**Status: All endpoints live.**

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `POST /v1/pipeline/run` | Full agent pipeline execution |
| `GET /v1/signals` | Recent signals from MongoDB reasoning traces |
| `POST /v1/signals/{id}/approve` | Places Alpaca order; idempotent |
| `POST /v1/signals/{id}/reject` | Persists rejection to MongoDB trace (`execution.rejected = true`) |
| `GET /v1/portfolio` | Live equity, cash, and positions from Alpaca |
| `GET /v1/trades` | Trade history from Supabase |
| `POST /v1/trades/{id}/override` | Cancels Alpaca order, writes to `override_log` |
| `POST /v1/backtest` | Create backtest job + start background task |
| `GET /v1/backtest` | List all backtest jobs for user |
| `GET /v1/backtest/{id}` | Job status + full results (polling target) |
| `DELETE /v1/backtest/{id}` | Delete job + MongoDB document |

---

## Authentication (Clerk)

**Status: Integrated end-to-end.**

- Login page at `/login` using Clerk `<SignIn />` component — light theme, mobile-first split-screen (signal table desktop left, Clerk widget right). Google OAuth only; email/password form hidden.
- `proxy.ts` (Clerk middleware) protects `/dashboard` and `/admin` — unauthenticated requests redirect to `/login`
- Frontend: `getClerkToken()` retrieves the session JWT; `fetchWithAuth()` attaches it to every API request
- Backend: `ClerkAuthMiddleware` verifies JWTs against the instance-specific JWKS endpoint
- JWKS URL is auto-derived from `CLERK_PUBLISHABLE_KEY` if `CLERK_JWKS_URL` is not set
- `OPTIONS` (CORS preflight) requests bypass auth middleware
- `request.state.user_id` is set on every authenticated request

---

## Frontend-Direct Supabase Auth Sync

**Status: Live.**

`AuthSync` component (mounted in root layout) owns the Supabase user lifecycle — no webhook dependency:

1. On sign-in, requests a Clerk JWT using the `atlas-supabase` template (`aud: "authenticated"`, HS256-signed with Supabase JWT secret).
2. Creates a per-request Supabase client (`lib/supabase.ts`) with `Authorization: Bearer <token>`.
3. `INSERT` profile for new users (boundary_mode `advisory`, onboarding_completed `false`).
4. On `23505` conflict (existing row), `UPDATE` only Clerk-sourced identity fields (`email`, `display_name`) — preserves user settings.
5. `UPSERT` portfolio record (`ignoreDuplicates: true`) — idempotent for returning users.

Backend uses `SUPABASE_SERVICE_KEY` (bypasses RLS natively) for all writes. The Clerk webhook `/webhooks/clerk` is retained but no longer load-bearing for profile creation.

---

## Supabase Integration

**Status: All 5 tables active with user-scoped RLS.**

| Table | What it stores |
|-------|---------------|
| `profiles` | User's `boundary_mode` preference — read on mount, written on Settings change |
| `portfolios` | Paper portfolio cash balance record |
| `positions` | Open positions synced from Alpaca on trade execution |
| `trades` | Full trade history with action, quantity, price, boundary mode |
| `override_log` | Audit trail: every Autonomous mode cancellation recorded with timestamp and reason |

RLS policies on all tables use `auth.jwt() ->> 'sub'` to match Clerk user IDs. Frontend reads use the Clerk JWT with the anon key. Backend writes use the service role key (bypasses RLS).

---

## Database Schema Migrations

**Status: Both migrations deployed to Supabase.**

`20260313054120_initial_schema.sql` — creates all 5 tables:
- `user_id` on every table (multi-tenancy, maps to Clerk user IDs)
- Initial permissive RLS policies (later replaced)
- `override_log` with `trade_id` foreign key, `cancelled_at` timestamp, `reason` text

`20260317100000_user_scoped_rls.sql` — replaces permissive policies with Clerk JWT-scoped policies:
- `profiles`: SELECT + INSERT + UPDATE scoped to `(auth.jwt() ->> 'sub') = id`
- `portfolios`: SELECT + INSERT + UPDATE scoped to `(auth.jwt() ->> 'sub') = user_id`
- `positions`, `trades`, `override_log`: SELECT only, scoped to `(auth.jwt() ->> 'sub') = user_id`

---

## Backtesting Engine

**Status: Fully operational.**

Replays the real Atlas AI pipeline (live Gemini calls) across historical date ranges and multiple tickers, simulating trade execution without touching Alpaca. Results are persisted to Supabase (job metadata) and MongoDB (full daily runs, equity curve, metrics).

### Virtual Portfolio

- Single shared `$10,000` capital pool across all tickers (mirrors real single-account behaviour)
- Fixed `$1,000` notional per trade
- EBC confidence thresholds mirror live config: conditional ≥ 60%, autonomous ≥ 65%
- Advisory mode: signals only — no trades, total_trades always 0
- Execution price: next trading day's open (fetched via yfinance, outside the constrained pipeline call — no look-ahead bias)
- Short selling not supported — SELL signals only close existing long positions
- Insufficient cash: signals skipped and logged

### `as_of_date` Constraint

`run_pipeline_async()` accepts an optional `as_of_date` parameter that constrains all yfinance price and fundamental data to what was available on that historical date. Sentiment analysis is not constrained (known limitation — documented).

### Async Runner

Background task (`backtesting/runner.py`) orchestrates the full run:

1. Mark job `running` in Supabase + create MongoDB results document
2. Compute Mon–Fri trading days via `pd.bdate_range`
3. For each trading day × ticker: run real Gemini pipeline, simulate execution, append to MongoDB
4. Progress updated once per trading day (`runs_completed / total_runs * 100`)
5. Compute aggregate metrics, finalize MongoDB + Supabase records
6. Job fails only if >50% of pipeline runs error

### Metrics Computed

| Metric | Notes |
|--------|-------|
| Cumulative return | `(final_value - initial_capital) / initial_capital` |
| Sharpe ratio | Annualised, risk-free rate = 0; `null` if std = 0 |
| Max drawdown | Negative value; `(peak - trough) / peak` across equity curve |
| Win rate | Closed trades only (SELL + covered positions); `null` if no trades |
| Signal-to-execution rate | `executed / total_signals`; `null` for advisory mode |
| Total trades | Advisory mode always 0 |
| Per-ticker contribution | `ticker_pnl / initial_capital` stored in MongoDB |

### Database

- **Supabase `backtest_jobs`**: status, tickers, date range, EBC mode, progress %, summary metrics, completed_at
- **MongoDB `backtest_results`**: full `daily_runs` array, `equity_curve`, `metrics` (including `per_ticker`)

### Frontend — Backtest Tab

Three views in the 5th dashboard tab:
- **Job list** — cards with key metrics, status badges, progress bars for running jobs; auto-polls every 5s
- **New job form** — tickers (comma-separated), date pickers, EBC mode radio, cost estimate (`~N AI calls · approx. $X`)
- **Results detail** — metrics grid, equity curve chart, per-ticker breakdown table, expandable daily runs

### Concurrency Controls

- Max 1 running job per user (429 if a job is already `running`)
- DELETE blocked on running jobs (409 Conflict)
- Max 90-day date range (cost guardrail)
- `end_date` must be ≥ 2 calendar days in the past (ensures next-day execution price is available)

---

## Signal Rejection

**Status: Persisted.**

`POST /v1/signals/{id}/reject` updates the MongoDB reasoning trace document, setting `execution.rejected = true`. The frontend receives confirmation and reflects the rejected state in the signal list.

---

## Frontend

**Status: Fully functional, auth-gated, mobile-first.**

Pages:
- `/` — Mobile-first marketing landing page. Conveys Atlas's value proposition: AI-driven signals, configurable execution authority, full reasoning transparency. Ticker tape, mode explainer, CTA.
- `/login` — Light-theme, mobile-first Clerk sign-in. Desktop: split-screen (signal table left, Clerk widget right). Mobile: single centered column. Google OAuth only — email/password form hidden. `position: fixed; inset: 0` bypasses Next.js App Router height propagation.
- `/dashboard` — 5-tab auth-gated dashboard. Portfolio overview, signal feed with approve/reject, positions table, backtest job management, settings with mode persistence.
- `/admin` — Manual pipeline trigger, system status, env display.
- `/design-system` — Living component library: colour tokens, typography, spacing, all button/badge/card variants, signal rows, motion specs, responsive breakpoints.

Design system:
- CSS custom properties for all tokens (`--brand`, `--bull`, `--bear`, `--surface`, `--ink`, etc.)
- Light mode by default; dark mode toggled manually via `ThemeProvider`
- Font discipline: Syne for headlines, Nunito Sans for body, JetBrains Mono only for financial data (tickers, prices, percentages)
- All body text ≥ 15px; all touch targets ≥ 44px
- Mobile-first layout; `min-width` breakpoints at 640px and 960px

---

## Databases

### MongoDB Atlas

Two collections active:
- `reasoning_traces` — every `POST /v1/pipeline/run` writes a full trace document. `GET /v1/signals` converts traces into the Signal API schema.
- `backtest_results` — one document per backtest job, storing daily runs, equity curve, and aggregate metrics.

### Supabase (PostgreSQL)

Schema deployed 13 March 2026. All 6 tables live with RLS. Backend reads and writes via `SUPABASE_SERVICE_KEY`. Frontend uses anon key.

| Table | Added |
|-------|-------|
| `profiles`, `portfolios`, `positions`, `trades`, `override_log` | 13 March 2026 |
| `backtest_jobs` | 19 March 2026 |

---

## Deployments

| Service | URL |
|---------|-----|
| Backend (UAT) | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend (UAT) | `https://atlas-broker-frontend-uat.vercel.app` |

---

## Bug Fixes

### `profile_service.py` — `maybe_single()` returning `None`

`supabase-py` v2 returns `None` (not a response object) from `.maybe_single().execute()` when no row is found. Fixed `get_profile()`: `if result.data:` → `if result and result.data:`. Prevents `AttributeError: 'NoneType' object has no attribute 'data'` crash on profile lookups for new users.

---

*Last updated: 19 March 2026*
