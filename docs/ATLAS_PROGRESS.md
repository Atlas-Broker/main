# Atlas — Progress Log

> What has been built and validated as of 17 March 2026.

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

---

## Authentication (Clerk)

**Status: Integrated end-to-end.**

- Login page at `/login` using Clerk `<SignIn />` component
- `proxy.ts` (Clerk middleware) protects `/dashboard` and `/admin` — unauthenticated requests redirect to `/login`
- Frontend: `getClerkToken()` retrieves the session JWT; `fetchWithAuth()` attaches it to every API request
- Backend: `ClerkAuthMiddleware` verifies JWTs against the instance-specific JWKS endpoint (`https://electric-foxhound-27.clerk.accounts.dev/.well-known/jwks.json`)
- JWKS URL is auto-derived from `CLERK_PUBLISHABLE_KEY` if `CLERK_JWKS_URL` is not set
- `OPTIONS` (CORS preflight) requests bypass auth middleware
- `request.state.user_id` is set on every authenticated request

---

## Supabase Integration

**Status: All 5 tables active.**

| Table | What it stores |
|-------|---------------|
| `profiles` | User's `boundary_mode` preference — read on mount, written on Settings change |
| `portfolios` | Paper portfolio cash balance record |
| `positions` | Open positions synced from Alpaca on trade execution |
| `trades` | Full trade history with action, quantity, price, boundary mode |
| `override_log` | Audit trail: every Autonomous mode cancellation recorded with timestamp and reason |

RLS policies enforced on all tables. Service role key used by backend writes.

---

## Database Schema Migration

**Status: Deployed to Supabase.**

Migration `20260313054120_initial_schema.sql` creates all 5 tables with:
- `user_id` on every table (multi-tenancy, maps to Clerk user IDs)
- RLS policies scoped to `auth.uid()` for all operations
- `override_log` with `trade_id` foreign key, `cancelled_at` timestamp, `reason` text

---

## Signal Rejection

**Status: Persisted.**

`POST /v1/signals/{id}/reject` updates the MongoDB reasoning trace document, setting `execution.rejected = true`. The frontend receives confirmation and reflects the rejected state in the signal list.

---

## Frontend

**Status: Fully functional, auth-gated, mobile-first.**

Pages:
- `/` — Mobile-first marketing landing page. Conveys Atlas's value proposition: AI-driven signals, configurable execution authority, full reasoning transparency. Ticker tape, mode explainer, CTA.
- `/login` — Split-screen Clerk sign-in. Always dark. Left: live signal feed preview. Right: Clerk widget.
- `/dashboard` — 4-tab auth-gated dashboard. Portfolio overview, signal feed with approve/reject, positions table, settings with mode persistence.
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

`reasoning_traces` collection active since Phase 2. Every `POST /v1/pipeline/run` writes a full trace document. `GET /v1/signals` converts traces into the Signal API schema.

### Supabase (PostgreSQL)

Schema deployed 13 March 2026. All 5 tables live with RLS. Backend reads and writes via `SUPABASE_SERVICE_KEY`. Frontend uses anon key.

---

## Deployments

| Service | URL |
|---------|-----|
| Backend (UAT) | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend (UAT) | `https://atlas-broker-frontend-uat.vercel.app` |

---

*Last updated: 17 March 2026*
