# Atlas — Progress Log

> What has been built and validated as of 3 April 2026.

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
- **Technical Analyst** — RSI-14, SMA-20/50/200, price momentum, volume ratio → Gemini structured signal
- **Fundamental Analyst** — P/E, P/B, revenue growth, debt/equity, ROE, analyst targets (14 metrics) → Gemini structured signal
- **Sentiment Analyst** — News headline tone, key themes → Gemini sentiment score (−1.0 to +1.0)
- **Synthesis Agent** — Bull case + bear case → unified trade thesis with confidence weighting
- **Risk Agent** — Deterministic: 2% portfolio risk rule, stop-loss from support or 5% fixed, 2:1 R/R take-profit
- **Portfolio Decision Agent** — Final BUY/SELL/HOLD + confidence score (0.0–1.0)
- **save_trace** — Persists full pipeline run to MongoDB `reasoning_traces` collection

Full node-by-node documentation in `backend/agents/README.md`.

---

## Execution Boundary Controller

**Status: All three modes operational, override window wired.**

| Mode | Confidence Threshold | Behaviour |
|------|---------------------|-----------|
| Advisory | N/A | Returns signal only — human executes manually via approve button |
| Autonomous Guardrail | ≥ 65% auto-executes; < 65% holds for review | High-confidence signals execute immediately; low-confidence signals queue and fire an email notification via Resend |
| Autonomous | ≥ 65% | Executes immediately — user has 5-minute override window to cancel |

The override window calls `POST /v1/trades/{id}/override`, which:
1. Cancels the Alpaca order via `broker.cancel_order(order_id)`
2. Writes an audit record to Supabase `override_log`
3. Returns confirmation to the frontend

The agents themselves have no knowledge of the EBC. They always produce a signal. Execution mode is enforced entirely outside the graph in `boundary/controller.py`.

---

## Philosophy Skills

**Status: Fully implemented as prompt overlays.**

Investment philosophy overlays each analyst's prompt without changing the graph topology. Activated via `philosophy_mode` on the `/v1/pipeline/run` request body.

| Mode | Lens |
|------|------|
| `balanced` | Default — no overlay, existing behaviour |
| `buffett` | Intrinsic value, margin of safety, moat durability, long-term owner thinking |
| `soros` | Macro reflexivity, feedback loops, identifying inflection points in prevailing bias |
| `lynch` | GARP (PEG ratio), consumer-lens, early trend identification |

`get_philosophy_prefix(philosophy_mode)` prepends the framing block to all three analyst prompts before the LLM call. Graph topology unchanged.

---

## Broker Adapter

**Status: Alpaca paper trading connected.**

Protocol-based `BrokerAdapter` (`broker/base.py`) with a working `AlpacaAdapter` (`broker/alpaca.py`). Places market orders at notional USD (~$1,000), fetches account equity, cash, and open positions. `broker/factory.py` exposes `get_broker()` and `get_broker_for_user()`. IBKR is a future implementation of the same protocol.

---

## Backend API

**Status: All endpoints live.**

### Core Pipeline & Signals

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check — no auth required |
| `POST /v1/pipeline/run` | Full agent pipeline execution with optional `philosophy_mode` |
| `GET /v1/signals` | Recent signals from MongoDB reasoning traces (default limit: 20) |
| `POST /v1/signals/{id}/approve` | Places Alpaca order; syncs to Supabase `trades`; idempotent |
| `POST /v1/signals/{id}/reject` | Persists rejection to MongoDB trace (`execution.rejected = true`) |

### Portfolio & Trades

| Endpoint | Description |
|----------|-------------|
| `GET /v1/portfolio` | Live equity, cash, positions from Alpaca + Supabase metadata |
| `GET /v1/portfolio/equity-curve` | Historical portfolio equity curve from Alpaca portfolio history API |
| `GET /v1/portfolio/positions/{ticker}/log` | Decision log for a specific ticker from MongoDB (limit: 20, max: 50) |
| `GET /v1/trades` | Trade history from Supabase `trades` table |
| `POST /v1/trades/{id}/override` | Cancels Alpaca order, writes to `override_log` |

### Backtesting

| Endpoint | Description |
|----------|-------------|
| `POST /v1/backtest` | Create backtest job; validates input; starts background runner |
| `GET /v1/backtest` | List all backtest jobs for user |
| `GET /v1/backtest/{id}` | Job status + full results (polling target for frontend) |
| `DELETE /v1/backtest/{id}` | Delete job + MongoDB document (blocked on running jobs — 409) |
| `POST /v1/backtest/{id}/cancel` | Cancel a running or queued job; queued jobs cancel immediately |

### Profile

| Endpoint | Description |
|----------|-------------|
| `GET /v1/profile` | Returns current user's profile (boundary_mode, philosophy_mode, tier, role) |
| `PATCH /v1/profile` | Updates `boundary_mode`, `display_name`, or `investment_philosophy` |

### Admin (Role-Based)

| Endpoint | Requires | Description |
|----------|----------|-------------|
| `GET /v1/admin/stats` | admin+ | Platform usage stats — active users, signals today, latest signal timestamp |
| `GET /v1/admin/users` | admin+ | All users with Clerk email enrichment |
| `PATCH /v1/admin/users/{id}/tier` | superadmin | Update user tier (free / pro / max) |
| `PATCH /v1/admin/users/{id}/role` | superadmin | Update user role (user / admin / superadmin) |
| `GET /v1/admin/system-status` | admin+ | Live health check for all services (Supabase, MongoDB, Clerk, Alpaca) |

### Webhooks

| Endpoint | Description |
|----------|-------------|
| `POST /webhooks/clerk` | Clerk user lifecycle webhook — retained but no longer load-bearing (AuthSync preferred) |

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

## Role-Based Access Control (RBAC)

**Status: Foundation implemented; partially enforced.**

Three roles stored in `profiles.role`:

| Role | Access |
|------|--------|
| `user` | Own data only |
| `admin` | `/v1/admin/*` read endpoints (stats, users, system-status) |
| `superadmin` | Full admin including tier/role management |

Enforcement via FastAPI dependencies: `require_admin`, `require_superadmin` in `api/dependencies.py`. Backtest concurrency limits are also role-gated (superadmin: 10 concurrent, admin: 5, user: 1).

Known gap: not all routes enforce roles yet. Comprehensive RBAC audit planned post-interim report.

---

## Frontend-Direct Supabase Auth Sync

**Status: Live (updated 3 April 2026).**

`AuthSync` component (mounted in root layout) owns the Supabase user lifecycle — no webhook dependency:

1. On sign-in, requests a Clerk JWT using the `atlas-supabase` template (`aud: "authenticated"`, HS256-signed with Supabase JWT secret).
2. Creates a per-request Supabase client (`lib/supabase.ts`) with `Authorization: Bearer <token>`.
3. `SELECT` profile to check if the user exists (avoids triggering a 409 network error in devtools).
4. If no row exists: `INSERT` profile (boundary_mode `advisory`, onboarding_completed `false`).
5. If row exists: `UPDATE` only Clerk-sourced identity fields (`email`, `display_name`) — preserves all user settings.
6. `UPSERT` portfolio record (`ignoreDuplicates: true`) — idempotent for returning users.

Backend uses `SUPABASE_SERVICE_KEY` (bypasses RLS natively) for all writes. The Clerk webhook `/webhooks/clerk` is retained but no longer load-bearing for profile creation.

---

## Notification Service

**Status: Live.**

`services/notification_service.py` sends emails via the Resend API. Currently used exclusively by the Autonomous Guardrail EBC mode to notify users when a low-confidence signal is queued for human review. Email includes ticker, action, confidence score, and approve/reject links.

---

## Supabase Integration

**Status: All 6 tables active with user-scoped RLS.**

| Table | What it stores |
|-------|---------------|
| `profiles` | User preferences: `boundary_mode`, `investment_philosophy`, `tier`, `role`, `email`, `display_name`, `onboarding_completed` |
| `portfolios` | Paper portfolio cash balance record |
| `positions` | Open positions synced from Alpaca on trade execution |
| `trades` | Full trade history with action, quantity, price, boundary mode, order_id |
| `override_log` | Audit trail: every Autonomous mode cancellation recorded with timestamp and reason |
| `backtest_jobs` | Backtest job metadata: status, tickers, date range, EBC mode, progress %, summary metrics |

RLS policies on all tables use `auth.jwt() ->> 'sub'` to match Clerk user IDs. Frontend reads use the Clerk JWT with the anon key. Backend writes use the service role key (bypasses RLS).

---

## Database Schema Migrations

**Status: All three migrations deployed to Supabase.**

`20260313054120_initial_schema.sql` — creates the initial 5 tables:
- `user_id` on every table (multi-tenancy, maps to Clerk user IDs)
- Initial permissive RLS policies (later replaced)
- `override_log` with `trade_id` foreign key, `cancelled_at` timestamp, `reason` text

`20260317100000_user_scoped_rls.sql` — replaces permissive policies with Clerk JWT-scoped policies:
- `profiles`: SELECT + INSERT + UPDATE scoped to `(auth.jwt() ->> 'sub') = id`
- `portfolios`: SELECT + INSERT + UPDATE scoped to `(auth.jwt() ->> 'sub') = user_id`
- `positions`, `trades`, `override_log`: SELECT only, scoped to `(auth.jwt() ->> 'sub') = user_id`

`20260319120000_backtest_jobs.sql` — adds the `backtest_jobs` table with full RLS (SELECT + INSERT + UPDATE + DELETE scoped to own rows).

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

`run_pipeline_async()` accepts an optional `as_of_date` parameter that constrains all yfinance price and fundamental data to what was available on that historical date. For backtesting, news is fetched from the Alpaca News API with `start`/`end` date params to prevent look-ahead bias in sentiment.

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

- **Supabase `backtest_jobs`**: status, tickers, date range, EBC mode, progress %, summary metrics (cumulative_return, sharpe_ratio, max_drawdown, win_rate, total_trades, signal_to_execution_rate), completed_at
- **MongoDB `backtest_results`**: full `daily_runs` array, `equity_curve`, `metrics` (including `per_ticker`), initial_capital

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
- Role-based limits: superadmin 10 concurrent, admin 5, user 1

---

## Scheduler

**Status: Implemented, single-user (v1).**

`scheduler/runner.py` uses APScheduler to run the full pipeline daily at 9:30 AM ET. Tickers and user ID are configured via `SCHEDULER_TICKERS` and `SCHEDULER_USER_ID` env vars. Results are saved to MongoDB. The app lifecycle in `main.py` starts the scheduler on startup.

Known limitation: single-user only. Phase 3 will extend to multi-user scheduling tied to subscription tier and broker connections.

---

## Signal Rejection

**Status: Persisted.**

`POST /v1/signals/{id}/reject` updates the MongoDB reasoning trace document, setting `execution.rejected = true`, `execution.rejected_at`, and `execution.status = "rejected"`. Idempotent if already rejected. Guards against rejecting already-executed signals.

---

## Frontend

**Status: Fully functional, auth-gated, mobile-first.**

Pages:
- `/` — Mobile-first marketing landing page. Conveys Atlas's value proposition: AI-driven signals, configurable execution authority (Advisory vs Autonomous), full reasoning transparency. Ticker tape, mode explainer, 4-stat proof grid, feature cards, CTA. Desktop shows signal preview.
- `/pricing` — Server component pricing page. Hero section, annual/monthly toggle (`BillingToggle` client island), Free/Pro/Max pricing cards, 4-section feature comparison table (Signal Engine, Portfolio, Broker & Integrations, Support). All CTAs link to `/login`.
- `/login` — Light-theme, mobile-first Clerk sign-in. Desktop: split-screen (signal table left showing 2 modes, Clerk widget right). Mobile: single centered column. Google OAuth only — email/password form hidden. `position: fixed; inset: 0` bypasses Next.js App Router height propagation.
- `/dashboard` — 5-tab auth-gated dashboard. Portfolio overview, signal feed with approve/reject, positions table, backtest job management, settings with mode persistence.
- `/admin` — Manual pipeline trigger, system status, env display. Requires admin or superadmin role.
- `/design-system` — Living component library: colour tokens, typography, spacing, all button/badge/card variants, signal rows, motion specs, responsive breakpoints.

### Dashboard Tabs

| Tab | What it shows |
|-----|---------------|
| Overview | Portfolio equity, cash, day P&L, latest signal, open positions snapshot |
| Signals | Signal list with confidence bars, risk params, approve/reject; calls `/v1/signals` |
| Positions | Open positions table with unrealised P&L; calls `/v1/portfolio` |
| Backtest | Job list with progress bars, new job form, results detail with equity curve chart |
| Settings | Theme toggle, execution mode selector (advisory/autonomous), persisted to Supabase `profiles.boundary_mode` |

### Design System

- CSS custom properties for all tokens (`--brand`, `--bull`, `--bear`, `--surface`, `--ink`, etc.)
- Light mode by default; dark mode toggled manually via `ThemeProvider`
- Font discipline: Syne for headlines, Nunito Sans for body, JetBrains Mono only for financial data (tickers, prices, percentages)
- All body text ≥ 15px; all touch targets ≥ 44px
- Mobile-first layout; `min-width` breakpoints at 640px and 960px

### Pricing Structure

- **Free**: $0 — 5-ticker limit, Advisory mode only
- **Pro**: $39/month (annual) / $49/month (monthly) — unlimited tickers, Autonomous mode, backtesting, decision log
- **Max**: $119/month (annual) / $149/month (monthly) — Pro features plus IBKR integration and onboarding call

---

## Databases

### MongoDB Atlas

Two collections active:
- `reasoning_traces` — every `POST /v1/pipeline/run` writes a full trace document. `GET /v1/signals` converts traces into the Signal API schema.
- `backtest_results` — one document per backtest job, storing daily runs, equity curve, and aggregate metrics.

Indexes on `reasoning_traces`:
- `{ user_id: 1, created_at: -1 }`
- `{ ticker: 1, created_at: -1 }`
- `{ "pipeline_run.final_decision.action": 1 }`

JSON Schema validation active at `moderate` level.

### Supabase (PostgreSQL)

Schema deployed 13 March 2026. All 6 tables live with RLS. Backend reads and writes via `SUPABASE_SERVICE_KEY`. Frontend uses anon key with Clerk JWT.

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

Keep-alive task in `main.py` pings the backend on a schedule to prevent Render free-tier sleep.

---

## Bug Fixes

### `AuthSync` — 409 Conflict in browser devtools (3 April 2026)

Replaced the optimistic `INSERT` + catch-23505-then-`UPDATE` pattern in `AuthSync.tsx` with a `SELECT` first approach. Returning users trigger a `SELECT` to check for row existence, then `UPDATE` only identity fields if found. New users still `INSERT`. Eliminates the 409 network log entirely while preserving the behaviour of not overwriting user settings (e.g. `boundary_mode`) on re-login.

### `profile_service.py` — `maybe_single()` returning `None`

`supabase-py` v2 returns `None` (not a response object) from `.maybe_single().execute()` when no row is found. Fixed `get_profile()`: `if result.data:` → `if result and result.data:`. Prevents `AttributeError: 'NoneType' object has no attribute 'data'` crash on profile lookups for new users.

---

## Known Gaps / Next Priorities

| Item | Status |
|------|--------|
| IBKR broker adapter | Planned — same `BrokerAdapter` protocol, different credentials |
| Stripe + tier enforcement | Planned — wire Free/Pro/Max limits to Stripe subscriptions |
| OAuth broker connect | Planned — replace manual API key entry with one-click IBKR OAuth |
| Scheduler (multi-user) | Partial — single-user only; Phase 3 extends to tier-gated multi-user |
| RBAC audit | Planned — not all routes enforce roles yet |

*Last updated: 3 April 2026*
