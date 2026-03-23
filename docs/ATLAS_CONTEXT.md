# Product Atlas — Context Briefing

> Single source of truth. Updated 23 March 2026.
> This is a **Product**. A project ends. A product compounds.

---

## 1. What is Atlas?

Capstone (BAC3004, SIT) AND real B2C product. Interim report **12 April 2026**, final report **19 July 2026**. Dogfood first (swing trading US equities), then sell as monthly subscription.

**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

**People**: Edmund (Lin Zhenming), Xu Bing Jie (academic supervisor — wants business/finance domain impact), Chin Wei Shan (industry supervisor, Prudential AI Engineer).

---

## 2. Execution Boundary Controller (EBC)

No retail platform offers configurable execution authority. Atlas's primary moat.

The EBC is a clean binary: same AI pipeline, same trading logic, same reasoning trace — only the execution authority changes.

| Mode | Behavior | Product Tier | Threshold | Status |
|------|----------|--------------|-----------|--------|
| Advisory | AI signals only; human reviews and executes manually | Free | N/A | ✅ Live |
| Autonomous | AI executes automatically; human has 5-minute override window | Pro / Max | ≥ 65% confidence | ✅ Live |

**Why two modes, not three**: An earlier design included a Conditional (human-approves-before-execution) mode. This was collapsed into Advisory — both require human action before any trade executes, so the distinction added complexity without meaningful behavioral difference. The resulting binary is cleaner for users, easier to evaluate experimentally, and maps directly to Parasuraman's levels of automation (human-in-the-loop vs human-on-the-loop).

---

## 3. Build State (23 March 2026)

### All original gaps CLOSED. Backtesting engine SHIPPED. Pricing page SHIPPED.

| Component | Status |
|-----------|--------|
| Agent pipeline (5 agents, parallel LangGraph) | ✅ Live |
| Execution Boundary Controller (2 modes) | ✅ Live |
| Auth (Clerk JWT end-to-end) | ✅ Live |
| Broker (Alpaca paper trading) | ✅ Live |
| Override window (cancel + audit log) | ✅ Live |
| Trade history sync (all Supabase tables) | ✅ Live |
| Mode persistence (profiles.boundary_mode) | ✅ Live |
| Signal rejection (persisted to MongoDB) | ✅ Live |
| Backtesting engine (async, real Gemini, virtual portfolio) | ✅ Live |
| Pricing page (Free/Pro/Max, annual/monthly toggle) | ✅ Live |
| Scheduled pipeline runs (APScheduler, 9:30 AM ET) | ✅ Live |

### Backend API — 12 endpoints, ALL live

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check — status, version, env |
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

### Frontend — 6 pages, 5-tab dashboard, auth-gated

| Page | Purpose |
|------|---------|
| `/` | Landing (ticker tape, 2-mode explainer, 4-stat proof grid, feature cards, CTA) |
| `/pricing` | Free/Pro/Max tiers, annual/monthly toggle, 4-section feature comparison table |
| `/login` | Clerk sign-in (Google OAuth, mobile-first, split-screen with 2-mode signal preview) |
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
- EBC threshold mirrors live config (autonomous ≥ 65%)
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

**Key gap to address**: Sentiment look-ahead bias. Fix via Alpaca News API `start`/`end` date params. Phase 3 enhancement.

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
│   ├── api/routes/  12 endpoints (incl. health)
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
- Run backtests immediately: 5 tickers (AAPL, MSFT, TSLA, NVDA, META) × 2 EBC modes × 60-day window = 10 backtest jobs. This produces equity curves, Sharpe ratios, and drawdown charts.
- Start running live pipeline daily in Advisory mode on 3–5 tickers. Accumulate real paper trading decisions with approve/reject history.
- Screenshot every result for the interim report.

### Priority 2: Write Interim Report (by 10 April)

System Design and Implementation sections write themselves from the existing READMEs. The hard parts are Introduction (business domain framing) and Early Results (needs data from Priority 1).

Interim report draft exists at `docs/Interim_Report.md` — semi-complete with TODO markers for data-dependent sections.

### Priority 3: Role-Based Access Control (RBAC)

**Why**: Edmund needs to give his supervisors and potential investors access to the product with appropriate permissions.

**Three roles**:

| Role | Permissions | Use case |
|------|-------------|----------|
| **User** | Dashboard access. View own signals, portfolio, trades, backtests. Approve/reject signals. Run pipeline for own account. | Normal subscribers. |
| **Admin** | Everything User has + `/admin` page access. Can trigger pipelines, view system status, see aggregate metrics. | Supervisors (Prof Xu, Wei Shan), trusted testers. |
| **SuperAdmin** | Everything Admin has + role management. Can assign User/Admin roles to any account. Can switch between User view and Admin view. Can view any user's data (bypasses RLS for read). | Edmund only. |

**Implementation**: `role` column on `profiles` table + middleware gates. Keep simple.

### Priority 4: Fix Sentiment Look-Ahead Bias

Use Alpaca News API with `start`/`end` date params, or cache historical news snapshots in MongoDB keyed by date + ticker.

### Priority 5: Pricing Tier Enforcement + Stripe

Wire Free/Pro/Max to Stripe. Enforce Free tier limits at API level (5-ticker max, Advisory mode only). Pro/Max unlock Autonomous + unlimited tickers.

### Priority 6: OAuth Broker Connect

Replace manual IBKR API key entry with one-click OAuth login for production broker integration.

### Priority 7: Scheduler Production Hardening

Current scheduler is single-user (`SCHEDULER_USER_ID`). Needs multi-user support tied to pricing tiers.

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

### Sections

1. **Introduction**: SG retail market gap, MAS AI governance, no configurable authority exists
2. **Literature Review**: TradingAgents, FinMem, AI-Trader, AlphaClaw, StockClaw, Trade Ideas, Composer, Endsley, Parasuraman
3. **System Design**: Architecture, pipeline, EBC (2 modes), broker abstraction, databases, auth, backtesting engine
4. **Implementation**: Build progress, pipeline flow, backtesting flow, scheduled runs, pricing page, key decisions
5. **Technical Challenges**: Parallel execution, three-way auth, idempotency, look-ahead bias, supabase-py quirks, Render sleep
6. **Evaluation Framework**: Quantitative + qualitative metrics, composite score, three experimental axes
7. **Early Results**: Backtest results, Advisory baseline, live pipeline data
8. **Knowledge Applied**: Classroom + beyond-classroom
9. **Remaining Work**: Sentiment fix, v3 conductor, Philosophy Skills, UAT, IBKR, Stripe, scheduler hardening

---

## 10. Demo Flows

Seven user journeys for investor demos and interim report screenshots.

**Flow 1: Onboarding** — Visit → Login (Google OAuth) → AuthSync → Dashboard with empty portfolio
**Flow 2: Run Pipeline** (wow moment) — Enter ticker → 3 parallel analysts → synthesis debate → risk → decision → reasoning trace visible
**Flow 3: Advisory Approve** — Review signal → Approve → Alpaca order placed → position appears → trade logged
**Flow 4: Advisory Reject** — Review signal → Reject → persisted to MongoDB → no execution
**Flow 5: Autonomous + Override** — Set autonomous mode → pipeline auto-executes → user overrides → Alpaca cancel + audit log
**Flow 6: Reasoning Trace Deep Dive** — Click signal → see all 3 analyst outputs, synthesis debate, risk params, execution status
**Flow 7: Backtesting** — Create job (tickers, date range, mode) → progress polling → equity curve + Sharpe + drawdown → per-ticker breakdown

---

## 11. Evaluation Framework

### Quantitative (across both modes)

Cumulative return, Sharpe ratio, max drawdown, trade execution latency, override frequency, signal-to-execution rate, rejection rate.

### Qualitative (UAT, Phase 5)

User confidence, decision regret, reasoning clarity, mode preference, override satisfaction.

### Composite "Optimal Boundary" Score

Performance (Sharpe) + Risk control (drawdown) + User trust (qualitative) + Execution efficiency (latency + signal-to-execution rate).

### Three Experimental Axes

1. EBC Mode (Advisory / Autonomous) — primary axis
2. Orchestration (v2 sequential / v3 adaptive conductor)
3. Philosophy Skills (Value / Momentum / Macro weightings)

---

## 12. Product Roadmap

**Phase A** (Apr–Jul): Backtesting refinement, UAT, final report. Close capstone strong.
**Phase B** (Jul–Aug): Stripe subscriptions, IBKR adapter, OAuth broker connect, developer API docs.
**Phase C** (Sep+): Crypto V2, NLP strategies V3, multi-broker V4, social features V5.

### Subscription (Finalized)

| Tier | Mode | Monthly | Annual (per month) |
|------|------|---------|-------------------|
| Free | Advisory | $0 | $0 |
| Pro | Autonomous | $49/mo | $39/mo |
| Max | Autonomous + IBKR + onboarding | $149/mo | $119/mo |

Free tier: 5-ticker limit, Advisory mode only.
Pro: Unlimited tickers, Autonomous mode, backtesting, decision log.
Max: Pro features + IBKR integration, onboarding call.

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
| Endsley (1995) | Situational awareness model — Advisory mode rationale |
| Parasuraman (2000) | Levels of automation — EBC spectrum rationale |

---

## 14. Decisions Log

| Decision | Rationale |
|----------|-----------|
| Product Atlas, not Project Atlas | Products compound |
| Two EBC modes, not three | Conditional collapsed into Advisory — both require human action, distinction adds complexity without behavioral difference |
| Alpaca (paper), IBKR (production) | Clean API + deepest market access |
| Clerk for auth | Better DX than Supabase Auth, Google OAuth |
| MongoDB traces + Supabase structured | Traces nested/variable; relational needs ACID + RLS |
| Gemini 2.5 Flash | Cost-effective, fast, structured JSON |
| US Equities only V1 | Bot ecosystem is crypto-native; uncontested lane |
| API-first | Dashboard is one client among many |
| Real Gemini pipeline for backtesting | Not simulated — actual AI behavior, more expensive but more honest |
| 3-role RBAC (User/Admin/SuperAdmin) | Need to onboard supervisors and demo to investors with role context |
| Free/Pro/Max pricing | Clean tier mapping to EBC modes, annual discount incentivises retention |

---

*Last updated: 23 March 2026*
*Maintained by: Lin Zhenming (Edmund)*