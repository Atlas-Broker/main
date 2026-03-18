# Product Atlas — Context Briefing (Part 1)

> Part 1: Product state, architecture, competitive positioning.
> Part 2: Demo flows, interim report strategy, evaluation framework, investor readiness.
> Updated 18 March 2026.

---

## 1. What is Atlas?

Capstone (BAC3004, SIT) AND real B2C product. Interim report **12 April 2026**, final report **19 July 2026**. Dogfood first (swing trading US equities), then sell as monthly subscription.

**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

**People**: Edmund (Lin Zhenming, student), Xu Bing Jie (academic supervisor — wants business/finance impact framing), Chin Wei Shan (industry supervisor, Prudential AI Engineer).

---

## 2. Execution Boundary Controller (EBC) — The Differentiator

No retail platform offers configurable execution authority. They're all binary.

| Mode | Behavior | Product Tier | Threshold | Status |
|------|----------|--------------|-----------|--------|
| Advisory | AI signals only; human executes | Free | N/A | ✅ Live |
| Conditional | AI proposes; human approves | Pro $30–50/mo | ≥ 60% | ✅ Live |
| Autonomous | AI executes; human has override window | Premium $80–120/mo | ≥ 65% | ✅ Live |

Trading logic identical across all modes. Only the authority changes.

---

## 3. Build State (18 March 2026)

### All five original gaps are CLOSED.

| Gap | Was | Now |
|-----|-----|-----|
| Auth | Anyone could access | ✅ Clerk JWT end-to-end. Login, session, JWKS verification. |
| Override window | Stub | ✅ Cancels Alpaca order + writes to `override_log` |
| Trade history sync | Not persisted | ✅ All 5 Supabase tables active with RLS |
| Mode persistence | Lost on refresh | ✅ Persisted to `profiles.boundary_mode` |
| Signal rejection | Silent | ✅ Persisted to MongoDB trace (`execution.rejected = true`) |

### Backend API — ALL endpoints live

| Endpoint | Status |
|----------|--------|
| `POST /v1/pipeline/run` | ✅ Full pipeline execution |
| `GET /v1/portfolio` | ✅ Live Alpaca account data |
| `GET /v1/signals` | ✅ Signals from MongoDB |
| `POST /v1/signals/{id}/approve` | ✅ Places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | ✅ Persists to MongoDB |
| `GET /v1/trades` | ✅ Trade history from Supabase |
| `POST /v1/trades/{id}/override` | ✅ Cancels order + audit log |

### Frontend — Auth-gated, mobile-first

| Page | Purpose |
|------|---------|
| `/` | Marketing landing. Ticker tape, mode explainer, CTA. |
| `/login` | Clerk sign-in. Google OAuth. Mobile-first split-screen. |
| `/dashboard` | 4 tabs: Overview, Signals, Positions, Settings. All live API calls. |
| `/admin` | Manual pipeline trigger, system status. |
| `/design-system` | Living component library. |

### Auth Flow

Clerk owns sessions. `ClerkAuthMiddleware` on backend verifies JWT via JWKS. `AuthSync` component syncs Clerk user → Supabase profile + portfolio on every sign-in. RLS policies use `auth.jwt() ->> 'sub'` to scope all rows to the authenticated user.

### Databases — Both fully active

**Supabase (PostgreSQL)** — All 5 tables live with user-scoped RLS:

| Table | Purpose | Active? |
|-------|---------|---------|
| `profiles` | `boundary_mode` preference | ✅ |
| `portfolios` | Cash balance | ✅ |
| `positions` | Open positions (synced from Alpaca) | ✅ |
| `trades` | Trade history | ✅ |
| `override_log` | Autonomous mode audit trail | ✅ |

**MongoDB Atlas** — `reasoning_traces` collection. Full document per pipeline run.

### Deployments

| Service | URL |
|---------|-----|
| Backend | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend | `https://atlas-broker-frontend-uat.vercel.app` |

---

## 4. Agent Pipeline Architecture

Inspired by TradingAgents (arxiv 2412.20138). Memory design from FinMem (arxiv 2311.13743).

```
Market Data (yfinance: 90-day OHLCV, fundamentals, news)
    ↓
[Technical | Fundamental | Sentiment]  ← parallel LangGraph fan-out
    ↓ fan-in
Synthesis (bull/bear debate) → Risk (2% rule, 2:1 R/R) → Portfolio Decision
    ↓
MongoDB (full reasoning trace)
    ↓
Execution Boundary Controller → Alpaca paper trading
```

All LLM calls: Gemini 2.5 Flash, structured JSON output, latency tracked per node.

**Agents**: Technical (RSI, SMA, volume), Fundamental (P/E, EPS, debt/equity), Sentiment (news headlines), Synthesis (bull/bear → unified thesis), Risk (deterministic 2% rule), Portfolio Decision (final BUY/SELL/HOLD + confidence 0–1).

### Reasoning Trace (MongoDB document per run)

```json
{
  "trace_id": "uuid", "user_id": "clerk-id", "ticker": "AAPL",
  "boundary_mode": "conditional", "created_at": "ISO8601",
  "pipeline_run": {
    "analysts": {
      "technical": { "signal": "BUY", "confidence": 0.72, "reasoning": "...", "latency_ms": 1200 },
      "fundamental": { "..." },
      "sentiment": { "..." }
    },
    "synthesis": { "bull_case": "...", "bear_case": "...", "verdict": "BUY", "confidence": 0.65 },
    "risk": { "stop_loss": 175.0, "take_profit": 195.0, "position_size_pct": 0.05, "risk_reward_ratio": 2.0 },
    "final_decision": { "action": "BUY", "confidence": 0.65, "reasoning": "..." }
  },
  "execution": { "executed": true, "order_id": "alpaca-id", "rejected": false, "override": false }
}
```

### Planned Enhancements (Post-Interim)

**v3 Adaptive Conductor**: Meta-agent decides which analysts to spawn based on market context. Abstract into `agents/graphs/sequential.py` (v2) and `agents/graphs/adaptive.py` (v3).

**Philosophy Skills (AlphaClaw-inspired, 熵简科技)**: Rename analysts to investment frameworks — Value Analyst, Momentum Analyst, Macro Analyst. Synthesis reconciles philosophical disagreement, not just data aggregation. Users save named strategy configurations with custom weights. Third experimental axis.

**SEC EDGAR Integration**: Fundamental analyst reasons over actual 10-Q/10-K filing text, not just yfinance numbers.

---

## 5. Technical Architecture

### Principle: API-First, GUI-Second

Every feature is an API endpoint first. Three consumers: REST API (OpenAPI 3.1 at `/docs`), webhooks (future), Next.js dashboard.

### Stack

| Layer | Tech | Status |
|-------|------|--------|
| Frontend | Next.js 16, TypeScript, Tailwind v4, Clerk | ✅ Vercel |
| Backend | FastAPI, Python 3.11+, uv, Docker | ✅ Render |
| Agents | LangGraph, Gemini 2.5 Flash | ✅ Live |
| Auth | Clerk (frontend + backend JWT verification) | ✅ Live |
| Relational DB | Supabase PostgreSQL (RLS) | ✅ Active |
| Document DB | MongoDB Atlas | ✅ Active |
| Broker (dev) | Alpaca paper trading | ✅ Connected |
| Broker (prod) | IBKR | ❌ Future |

### LLM: Gemini 2.5 Flash via factory pattern (`agents/llm/factory.py`). Provider-agnostic — swap via env vars.

### Broker: `BrokerAdapter` protocol. `AlpacaAdapter` live. `IBKRAdapter` future.

---

## 6. Repo Structure

Monorepo at `github.com/Atlas-Broker/main`:

```
├── frontend/        → Vercel (Next.js 16, Clerk, Tailwind)
├── backend/         → Render (FastAPI, Docker, Clerk JWT middleware)
│   ├── api/routes/  /v1/* endpoints
│   ├── broker/      BrokerAdapter + AlpacaAdapter
│   ├── boundary/    EBC (controller.py, modes.py)
│   ├── db/          Supabase client
│   └── services/    Pipeline + signals business logic
├── agents/          → Imported by backend
│   ├── analysts/    Technical, Fundamental, Sentiment
│   ├── synthesis/   Bull/bear debate
│   ├── risk/        Deterministic rules
│   ├── portfolio/   Final decision
│   ├── llm/         Factory pattern
│   └── orchestrator.py
├── database/        Shared (Supabase migrations + MongoDB schemas)
├── docs/            This file, ATLAS_PROGRESS.md
└── CLAUDE.md
```

---

## 7. Competitive Positioning

### The gap Atlas fills

No retail platform offers **configurable execution authority + full reasoning transparency**.

| Platform | Price | Weakness Atlas Exploits |
|----------|-------|------------------------|
| Trade Ideas / Holly AI | $178–254/mo | Total black box, no user control |
| Composer | $32/mo | AI translates, doesn't reason. No EBC. |
| StockHero | $30–100/mo | No multi-agent reasoning |
| 3Commas | $20–200/mo | Rule-based, no AI reasoning |
| Cryptohopper | $29–129/mo | Black box |
| StockClaw | Open source | Root-agent pattern, no EBC, no web UI, Telegram only |
| OpenClaw skills | Various | Execution wrappers, no intelligence |

Atlas is first to combine: reasoning traces + configurable authority + US equities + swing trading + developer API.

### Industry Tailwinds

EU XAI requirements, IOSCO 2025 (69% firms expect AI compliance issues), Colorado AI Act 2026, "black box problem" as #1 retail AI trading concern, 89% global trading volume AI-driven.

---

## 8. Timeline

| Phase | Period | Status |
|-------|--------|--------|
| Phase 1: System Design | 2–15 Mar | ✅ Done |
| Phase 2: Core Agent Dev | 16 Mar – 12 Apr | 🔄 Current — pipeline live, all gaps closed |
| Phase 3: Backtesting | 13 Apr – 3 May | Not started |
| Phase 4: Broker Integration | 4–31 May | ✅ Done early |
| Phase 5: UAT | 1–21 Jun | Not started |
| Phase 6: Refinement | 22 Jun – 5 Jul | Not started |
| Phase 7: Final Eval | 6–19 Jul | Not started |

---

## 9. Academic References

| Paper | Relevance |
|-------|-----------|
| TradingAgents (2412.20138) | Multi-agent pipeline, Atlas adds EBC |
| FinMem (2311.13743) | Layered memory design |
| AI-Trader (HKUDS, 2512.10971) | LLM trading benchmark |
| AlphaClaw (熵简科技) | Philosophy Skills for analysts |
| TradeTrap | Security in AI trading |
| StockClaw (24mlight) | Root-agent pattern, frozen-dataset backtesting |

---

## 10. Decisions Log

| Decision | Rationale |
|----------|-----------|
| "Product Atlas" not "Project Atlas" | Products compound |
| Alpaca (paper), IBKR (production) | Clean API + deepest market access |
| Clerk for auth (not Supabase Auth) | Better DX, Google OAuth, session management |
| MongoDB traces + Supabase structured | Traces are nested/variable; relational needs ACID + RLS |
| Gemini 2.5 Flash | Cost-effective, fast, structured JSON |
| US Equities only V1 | Bot ecosystem is crypto-native; uncontested lane |
| API-first | Dashboard is one client among many |

---

*Part 2 covers: Demo flows, interim report strategy, evaluation framework, investor pitch.*
*Last updated: 18 March 2026*
