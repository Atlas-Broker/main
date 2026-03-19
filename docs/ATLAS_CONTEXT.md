# Product Atlas — Context Briefing

> Single source of truth. Updated 19 March 2026.
> This is a **Product**. A project ends. A product compounds.

---

## 1. What is Atlas?

Capstone (BAC3004, SIT) AND real B2C product. Interim report **12 April 2026**, final report **19 July 2026**. Dogfood first (swing trading US equities), then sell as monthly subscription.

**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

**People**: Edmund (Lin Zhenming), Xu Bing Jie (academic supervisor — wants business/finance domain impact), Chin Wei Shan (industry supervisor, Prudential AI Engineer).

---

## 2. Execution Boundary Controller (EBC)

No retail platform offers configurable execution authority. Atlas's primary moat.

| Mode | Behavior | Product Tier | Threshold | Status |
|------|----------|--------------|-----------|--------|
| Advisory | AI signals only; human executes | Free | N/A | ✅ Live |
| Conditional | AI proposes; human approves | Pro $30–50/mo | ≥ 60% | ✅ Live |
| Autonomous | AI executes; human overrides | Premium $80–120/mo | ≥ 65% | ✅ Live |

---

## 3. Build State (19 March 2026)

### All original gaps CLOSED. Backtesting engine SHIPPED.

| Component | Status |
|-----------|--------|
| Agent pipeline (5 agents, parallel LangGraph) | ✅ Live |
| Execution Boundary Controller (3 modes) | ✅ Live |
| Auth (Clerk JWT end-to-end) | ✅ Live |
| Broker (Alpaca paper trading) | ✅ Live |
| Override window (cancel + audit log) | ✅ Live |
| Trade history sync (all Supabase tables) | ✅ Live |
| Mode persistence (profiles.boundary_mode) | ✅ Live |
| Signal rejection (persisted to MongoDB) | ✅ Live |
| Backtesting engine (async, real Gemini, virtual portfolio) | ✅ Live |

### Backend API — 11 endpoints, ALL live

| Endpoint | Description |
|----------|-------------|
| `POST /v1/pipeline/run` | Full pipeline execution |
| `GET /v1/portfolio` | Live Alpaca account data |
| `GET /v1/signals` | Signals from MongoDB |
| `POST /v1/signals/{id}/approve` | Places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | Persists to MongoDB |
| `GET /v1/trades` | Trade history from Supabase |
| `POST /v1/trades/{id}/override` | Cancels order + audit log |
| `POST /v1/backtest` | Create backtest job (async) |
| `GET /v1/backtest` | List user's backtest jobs |
| `GET /v1/backtest/{id}` | Job status + full results |
| `DELETE /v1/backtest/{id}` | Delete job + MongoDB results |

### Frontend — 5-tab dashboard, auth-gated

| Page | Purpose |
|------|---------|
| `/` | Landing (ticker tape, mode explainer, CTA) |
| `/login` | Clerk sign-in (Google OAuth, mobile-first) |
| `/dashboard` | 5 tabs: Overview, Signals, Positions, **Backtest**, Settings |
| `/admin` | Manual pipeline trigger, system status |
| `/design-system` | Living component library |

### Databases — Both fully active

**Supabase**: 6 tables with user-scoped RLS — `profiles`, `portfolios`, `positions`, `trades`, `override_log`, `backtest_jobs`

**MongoDB**: 2 collections — `reasoning_traces`, `backtest_results`

### Deployments

| Service | URL |
|---------|-----|
| Backend | `https://atlas-broker-backend-uat.onrender.com` |
| Frontend | `https://atlas-broker-frontend-uat.vercel.app` |

---

## 4. Backtesting Engine

### How it works

Replays the real AI pipeline (live Gemini calls) across historical date ranges. `as_of_date` constrains yfinance data so agents only see what was available on that day — no look-ahead bias. Virtual portfolio simulates execution without touching Alpaca.

- $10,000 shared capital pool, $1,000 notional per trade
- EBC thresholds mirror live config (60% conditional, 65% autonomous)
- Advisory mode: signals only, total_trades always 0
- Execution price: next trading day's open
- Short selling not supported
- Max 1 running job per user, max 90-day range

### Metrics computed

Cumulative return, Sharpe ratio (annualised), max drawdown, win rate, signal-to-execution rate, per-ticker contribution.

### Atlas vs StockClaw Backtesting Comparison

| Dimension | Atlas | StockClaw |
|-----------|-------|-----------|
| **Data constraint** | `as_of_date` parameter truncates yfinance OHLCV + fundamentals to historical date. Agents cannot see future prices. | "Frozen datasets" with "isolated day sessions" and strict T-1 constraints. Same principle. |
| **Pipeline realism** | Runs the REAL Gemini pipeline — same LLM calls, same agents, same prompts as live trading. Results reflect actual AI behavior. | Also runs real agent pipeline against constrained data. |
| **Sentiment data** | ⚠️ Known limitation — news/sentiment is NOT date-constrained. yfinance news endpoint returns current headlines regardless of `as_of_date`. | Uses frozen news datasets specific to each historical date. |
| **Execution simulation** | Virtual portfolio with shared capital pool. Buys at next-day open price. Tracks cash, positions, P&L per trade. | Structured paper portfolio with "explicit execution boundaries" and auditable state changes. |
| **Concurrency** | Async background task, max 1 per user, progress polling. | Not documented (likely synchronous). |
| **Output** | Supabase metadata + MongoDB full daily runs + equity curve + metrics. Frontend tab with chart. | Not documented (likely terminal/file output). |

**Key gap to address**: Sentiment look-ahead bias. Atlas's `as_of_date` constraint covers price and fundamental data but NOT news headlines. For the interim report, document this as a known limitation. For Phase 3 refinement, consider caching historical news snapshots or using a news API with date-range filtering (Alpaca News API supports `start`/`end` params).

**What Atlas does better**: Real LLM pipeline replay (not rule-based simulation), web UI with equity curve visualization, async job management, full persistence to both databases.

**What to adopt from StockClaw**: Frozen news/sentiment datasets for true T-1 purity. This is a Phase 3 enhancement.

---

## 5. Agent Pipeline Architecture

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

All LLM calls: Gemini 2.5 Flash, structured JSON, latency tracked per node. Factory pattern in `agents/llm/factory.py`.

### Planned Enhancements (Post-Interim)

- **v3 Adaptive Conductor**: Meta-agent selectively spawns analysts based on market context
- **Philosophy Skills** (AlphaClaw 熵简科技): Name analysts as Value/Momentum/Macro frameworks. Third experimental axis.
- **SEC EDGAR Integration**: Fundamental analyst reasons over 10-Q/10-K filing text

---

## 6. Technical Architecture

### Principle: API-First, GUI-Second

| Layer | Tech | Status |
|-------|------|--------|
| Frontend | Next.js 16, TypeScript, Tailwind v4, Clerk | ✅ Vercel |
| Backend | FastAPI, Python 3.11+, uv, Docker | ✅ Render |
| Agents | LangGraph, Gemini 2.5 Flash | ✅ Live |
| Auth | Clerk (JWT + JWKS verification) | ✅ Live |
| Relational DB | Supabase PostgreSQL (RLS) | ✅ 6 tables |
| Document DB | MongoDB Atlas | ✅ 2 collections |
| Broker (dev) | Alpaca paper trading | ✅ Connected |
| Broker (prod) | IBKR | ❌ Future |

### Repo: `github.com/Atlas-Broker/main`

```
├── frontend/        → Vercel
├── backend/         → Render
│   ├── api/routes/  11 endpoints
│   ├── broker/      BrokerAdapter + AlpacaAdapter
│   ├── boundary/    EBC
│   ├── backtesting/ Runner, simulator, metrics
│   ├── db/          Supabase client
│   └── services/    Pipeline, signals, backtest
├── agents/          → Imported by backend
├── database/        Shared schemas (3 migrations)
└── docs/            This file
```

---

## 7. What to Build Next (Priority Order)

### Priority 1: Generate Data (THIS WEEK)

**Why**: The backtesting engine and live pipeline are both ready. The bottleneck is now data, not code. Every day without data is a day of missing evidence for the interim report and investor demo.

**Action items**:
- Run backtests immediately: 5 tickers (AAPL, MSFT, TSLA, NVDA, META) × 3 EBC modes × 60-day window = 15 backtest jobs. This produces equity curves, Sharpe ratios, and drawdown charts.
- Start running live pipeline daily in Conditional mode on 3–5 tickers. Accumulate real paper trading decisions with approve/reject history.
- Screenshot every result for the interim report.

### Priority 2: Scheduled Pipeline Runs

**Why**: Transforms Atlas from "a tool Edmund triggers manually" to "a system that works for Edmund while he's at Prudential." Critical for both the investor narrative and dogfooding.

**Implementation**: Render cron job or APScheduler background task in FastAPI. Runs `POST /v1/pipeline/run` for a configurable watchlist at US market open (9:30 AM ET / 9:30 PM SGT). Sends notification when signals are ready (Telegram or email — lightweight, not a full notification system).

### Priority 3: Role-Based Access Control (RBAC)

**Why**: Edmund needs to give his supervisors and potential investors access to the product with appropriate permissions. Currently there are only "authenticated users" — no role distinction.

**Three roles**:

| Role | Permissions | Use case |
|------|-------------|----------|
| **User** | Dashboard access. View own signals, portfolio, trades, backtests. Approve/reject signals. Run pipeline for own account. | Normal subscribers. |
| **Admin** | Everything User has + `/admin` page access. Can trigger pipelines, view system status, see aggregate metrics. | Supervisors (Prof Xu, Wei Shan), trusted testers. |
| **SuperAdmin** | Everything Admin has + role management. Can assign User/Admin roles to any account. Can switch between User view and Admin view. Can view any user's data (bypasses RLS for read). | Edmund only. Used to onboard supervisors, demo to investors by switching context. |

**Implementation approach**:
- Add `role` column to `profiles` table (enum: `user`, `admin`, `superadmin`, default: `user`)
- New Supabase migration: `ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin'));`
- Backend: middleware or dependency that reads `role` from `profiles` and gates route access
- Frontend: conditional rendering based on role (hide `/admin` link for Users, show role switcher for SuperAdmin)
- SuperAdmin can `PATCH /v1/users/{id}/role` to assign roles
- SuperAdmin view switcher: dropdown in nav that lets Edmund see the product as a User or as an Admin — without changing his actual role

**Note**: Keep this simple. Don't over-engineer. A `role` column + a few `if` checks is enough. Full RBAC frameworks are overkill for the capstone.

### Priority 4: Write Interim Report (by 10 April)

Seven sections (see Section 9 below). System Design and Implementation sections write themselves from the existing READMEs. The hard parts are Introduction (business domain framing) and Early Results (needs data from Priority 1).

### Priority 5: Fix Sentiment Look-Ahead Bias

**Why**: The backtesting engine's `as_of_date` constraint covers OHLCV and fundamentals but NOT news headlines. yfinance returns current news regardless of date. This is documented but should be fixed before the final report.

**Fix**: Use Alpaca News API with `start`/`end` date params, or cache historical news snapshots in MongoDB keyed by date + ticker.

---

## 8. Competitive Positioning

No retail platform offers **configurable execution authority + full reasoning transparency**.

| Platform | Price | Weakness Atlas Exploits |
|----------|-------|------------------------|
| Trade Ideas / Holly AI | $178–254/mo | Total black box, no user control |
| Composer | $32/mo | AI translates, doesn't reason. No EBC. |
| StockHero | $30–100/mo | No multi-agent reasoning |
| 3Commas | $20–200/mo | Rule-based, no AI reasoning |
| StockClaw | Open source | Root-agent, no EBC, no web UI, no backtest UI |
| OpenClaw skills | Various | Execution wrappers, no intelligence |

---

## 9. Interim Report Strategy (Due 12 April)

### Narrative

"We built a working multi-agent AI trading system with a novel configurable execution authority mechanism, including a backtesting engine that replays the real AI pipeline on historical data. Here's the design, evidence, evaluation framework, and early results."

### Seven sections

1. **Introduction** (2–3p): SG retail market gap, MAS AI governance, no configurable authority exists
2. **Literature Review** (3–4p): TradingAgents, FinMem, AI-Trader, AlphaClaw, StockClaw, Trade Ideas, Composer
3. **System Design** (4–5p): Architecture, pipeline, EBC, broker abstraction, databases, auth, backtesting engine
4. **Implementation** (3–4p): Screenshots of all flows, pipeline output, reasoning trace, backtest equity curve
5. **Evaluation Framework** (2–3p): Quantitative + qualitative metrics, composite score, three experimental axes
6. **Early Results** (2–3p): Backtest results across tickers/modes, live paper trading decisions
7. **Remaining Work** (1p): v3 conductor, Philosophy Skills, UAT, IBKR

---

## 10. Demo Flows

Six user journeys for investor demos and interim report screenshots.

**Flow 1: Onboarding** — Visit → Login (Google OAuth) → AuthSync → Dashboard with empty portfolio
**Flow 2: Run Pipeline** (wow moment) — Enter ticker → 3 parallel analysts → synthesis debate → risk → decision → reasoning trace visible
**Flow 3: Conditional Approve** — Review signal → Approve → Alpaca order placed → position appears → trade logged
**Flow 4: Conditional Reject** — Review signal → Reject → persisted to MongoDB → no execution
**Flow 5: Autonomous + Override** — Set autonomous mode → pipeline auto-executes → user overrides → Alpaca cancel + audit log
**Flow 6: Reasoning Trace Deep Dive** — Click signal → see all 3 analyst outputs, synthesis debate, risk params, execution status
**Flow 7: Backtesting** — Create job (tickers, date range, mode) → progress polling → equity curve + Sharpe + drawdown → per-ticker breakdown

---

## 11. Evaluation Framework

### Quantitative (across all 3 modes)

Cumulative return, Sharpe ratio, max drawdown, trade execution latency, override frequency, signal-to-execution rate, rejection rate.

### Qualitative (UAT, Phase 5)

User confidence, decision regret, reasoning clarity, mode preference, override satisfaction.

### Composite "Optimal Boundary" Score

Performance (Sharpe) + Risk control (drawdown) + User trust (qualitative) + Execution efficiency (latency + signal-to-execution rate).

### Three Experimental Axes

1. EBC Mode (Advisory / Conditional / Autonomous)
2. Orchestration (v2 sequential / v3 adaptive conductor)
3. Philosophy Skills (Value / Momentum / Macro weightings)

---

## 12. Product Roadmap

**Phase A** (Apr–Jul): Backtesting refinement, UAT, final report. Close capstone strong.
**Phase B** (Jul–Aug): Stripe subscriptions, IBKR adapter, onboarding, developer API docs.
**Phase C** (Sep+): Crypto V2, NLP strategies V3, multi-broker V4, social features V5.

### Subscription

| Tier | Mode | Price |
|------|------|-------|
| Free | Advisory | $0 |
| Pro | Conditional | $30–50/mo |
| Premium | Autonomous | $80–120/mo |

---

## 13. Academic References

| Paper | Relevance |
|-------|-----------|
| TradingAgents (2412.20138) | Multi-agent pipeline, Atlas adds EBC |
| FinMem (2311.13743) | Layered memory design |
| AI-Trader (HKUDS, 2512.10971) | LLM trading benchmark |
| AlphaClaw (熵简科技) | Philosophy Skills for analysts |
| StockClaw (24mlight) | Root-agent, frozen-dataset backtesting, T-1 constraint |
| TradeTrap | Security in AI trading |

---

## 14. Decisions Log

| Decision | Rationale |
|----------|-----------|
| Product Atlas, not Project Atlas | Products compound |
| Alpaca (paper), IBKR (production) | Clean API + deepest market access |
| Clerk for auth | Better DX than Supabase Auth, Google OAuth |
| MongoDB traces + Supabase structured | Traces nested/variable; relational needs ACID + RLS |
| Gemini 2.5 Flash | Cost-effective, fast, structured JSON |
| US Equities only V1 | Bot ecosystem is crypto-native; uncontested lane |
| API-first | Dashboard is one client among many |
| Real Gemini pipeline for backtesting | Not simulated — actual AI behavior, more expensive but more honest |
| 3-role RBAC (User/Admin/SuperAdmin) | Need to onboard supervisors and demo to investors with role context |

---

*Last updated: 19 March 2026*
*Maintained by: Lin Zhenming (Edmund)*
