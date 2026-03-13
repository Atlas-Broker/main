# Product Atlas — Full Context Briefing (v2)

> Updated 13 March 2026. Reflects actual build state, not aspirations.
>
> **Naming convention**: This is a **Product**, not a Project. A project ends. A product compounds. Every decision — from database schema to error message copy — should reflect that intent.

---

## 1. What is Atlas?

Atlas is simultaneously a **final year capstone** (BAC3004 at Singapore Institute of Technology) and a **real B2C product**. The dual intent:

1. **Academic**: Score well on the capstone. Interim report due **12 April 2026**, final report due **19 July 2026**.
2. **Product**: Build a subscription-based AI trading assistant for retail investors. Dogfood it first — use Atlas to earn first stock market profits via swing trading (days-to-weeks). Once validated on self, roll out as a monthly subscription.

The architecture is **product-ready from day one**. The capstone uses paper trading only, but every design decision assumes real money and real users are coming.

**Full title**: Agentic AI Support System for Investment and Trading  
**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

---

## 2. The People

- **Student**: Lin Zhenming (Edmund), Matriculation 2302993, Applied Computing Fintech, SIT
- **Academic Supervisor**: Xu Bing Jie (bingjie.xu@singaporetech.edu.sg) — Assistant Professor. Key feedback: needs stronger business/finance domain impact. Frame around MAS regulations, SGX investor protection, transparency gap in SG retail platforms (moomoo, Tiger Brokers, Syfe Trade).
- **Industry Supervisor**: Chin Wei Shan (wei.shan.chin@prudential.com.sg) — AI Engineer, Prudential Singapore. Feedback: direction and purpose well thought out.
- **Context**: Edmund is concurrently an AI Engineering Intern at Prudential, 40h/week, Jan–Aug 2026. Atlas is built in parallel.

---

## 3. Core Concept

Atlas is a **multi-agent AI trading system** whose unique differentiator is the **Execution Boundary Controller (EBC)** — a configurable mechanism that lets users choose how much authority the AI has over trade execution.

### Three Execution Modes

| Mode | Behavior | Product Tier | Current State |
|------|----------|--------------|---------------|
| **Advisory** | AI generates signals; human executes manually | Free tier | ✅ Working |
| **Conditional** | AI proposes trades; human must approve before execution | Mid tier ($30–50/mo) | ✅ Working (60% confidence threshold) |
| **Autonomous** | AI executes automatically; human has override window | Premium tier ($80–120/mo) | ⚠️ Executes, but override not wired |

The trading logic is **identical** across all three modes. Only the execution authority changes. This enables controlled academic comparison AND creates natural pricing tiers.

The EBC is Atlas's primary moat. No existing retail platform offers a configurable execution authority boundary. They are all binary: the bot trades, or it doesn't.

---

## 4. Current Build State (as of 13 March 2026)

### What's live and working

**Agent Pipeline** — Fully operational. A LangGraph `StateGraph` runs three analyst agents in parallel (fan-out), then fans in to synthesis, risk management, and portfolio decision. All nodes are real implementations, not stubs. All LLM calls use Gemini 2.5 Flash with structured JSON output (`response_mime_type="application/json"`). Latency is tracked per node.

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

**Technical Analyst**: RSI, 20/50-day SMA, price change %, volume trend → Gemini signal  
**Fundamental Analyst**: P/E, EPS growth, debt/equity, analyst targets → Gemini signal  
**Sentiment Analyst**: News headline tone, key themes → Gemini sentiment score  
**Synthesis Agent**: Constructs bull case + bear case, delivers unified trade thesis  
**Risk Agent**: Deterministic — 2% portfolio risk, stop-loss from support or 5% fixed, 2:1 R/R take-profit  
**Portfolio Decision Agent**: Final BUY/SELL/HOLD + confidence score (0–1)

**Execution Boundary Controller** — Three modes with confidence thresholds. Advisory returns signal only. Conditional marks signal `awaiting_approval`. Autonomous executes immediately if confidence ≥ 65%.

**Broker Adapter** — Protocol-based abstraction (`BrokerAdapter`). Working `AlpacaAdapter` places market orders, fetches account equity/cash/positions. IBKR is a future implementation of the same protocol.

**Backend API** — FastAPI with versioned routes:

| Endpoint | Status |
|----------|--------|
| `POST /v1/pipeline/run` | ✅ Live — full pipeline execution |
| `GET /v1/portfolio` | ✅ Live — real Alpaca account data |
| `GET /v1/signals` | ✅ Live — recent signals from MongoDB |
| `POST /v1/signals/{id}/approve` | ✅ Live — places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | ❌ Stub — not persisted |
| `GET /v1/trades` | ❌ Stub — returns mock data |
| `POST /v1/trades/{id}/override` | ❌ Stub — Alpaca cancel not wired |

**Frontend Dashboard** — Next.js 16, three pages:
- `/` — Landing page with ticker tape animation, execution mode explainer
- `/dashboard` — 4-tab layout (Overview, Signals, Positions, Settings). Calls live backend APIs on mount. Signal approval wired. Theme toggle working.
- `/admin` — Desktop sidebar. Trigger pipeline runs manually, view system status.

**Databases**:
- **MongoDB Atlas** — `reasoning_traces` collection active. Every `POST /v1/pipeline/run` writes a full trace. Powers the signals list.
- **Supabase (PostgreSQL)** — 5 tables deployed with RLS policies. Schema is multi-tenancy ready (`user_id` on every table). **But not yet used by the app** — state lives in Alpaca + MongoDB.

**UAT Deployments**:
- Backend: `https://atlas-broker-backend-uat.onrender.com`
- Frontend: `https://atlas-broker-frontend-uat.vercel.app`

### The five gaps

These are the delta between "working demo" and "usable product." Ordered by severity.

**Gap 1: Authentication not integrated** (BLOCKER for any real usage)  
Anyone with the UAT URL can view the portfolio and approve trades. Supabase Auth is configured at infrastructure level (env vars, RLS policies) but nothing in the frontend or backend uses it. No login page, no session, no user context.  
*Fix*: Supabase Auth in frontend (login/signup, session middleware, `useAuth` hook), pass JWT to backend, extract `user_id` for RLS.

**Gap 2: Override window not implemented** (BLOCKER for Autonomous mode)  
`POST /v1/trades/{id}/override` is a stub. When AI executes automatically, there is no way to cancel.  
*Fix*: Wire endpoint to `broker.cancel_order(order_id)`, write to Supabase `override_log`.

**Gap 3: Trade history not synced to Supabase** (BLOCKER for analytics/evaluation)  
Positions and account data come from Alpaca only. Nothing writes to Supabase when a trade executes. No persistent history, no audit trail, no basis for Sharpe/drawdown calculation.  
*Fix*: On `approve_and_execute`, write to `supabase.trades` and update `supabase.positions`.

**Gap 4: Execution mode not persisted** (UX issue)  
Settings tab lets users pick a mode, but selection is local component state only. Lost on refresh.  
*Fix*: Write to `profiles.boundary_mode` in Supabase on selection, read on mount.

**Gap 5: Signal rejection is silent** (Minor)  
`POST /v1/signals/{id}/reject` returns placeholder, doesn't persist.  
*Fix*: Log rejection to MongoDB trace (`execution.rejected = true`), return confirmation.

### Honest readiness assessment

| Dimension | Status | Detail |
|-----------|--------|--------|
| **Interim report** (12 Apr) | ✅ Strong position | Core system works end-to-end. Needs evaluation framework, structured results from paper trading sessions, and business impact framing. |
| **Real user usage** | ❌ Not ready | Gaps 1-3 are dealbreakers. No auth = liability. No trade history = no audit trail. No override = no emergency brake. |
| **Product launch** | ❌ Not ready | Needs auth, persistent trades, override, subscription/payments, onboarding UX, error handling hardening. |

---

## 5. Competitive Positioning

### The gap Atlas fills

The retail AI trading market is split between:
- **"Here's a signal, figure it out"** — Trade Ideas Holly ($178–254/mo), TrendSpider, Tickeron
- **"Give us your money, trust the black box"** — 3Commas, Cryptohopper, Pionex, WunderTrading
- **"Describe what you want in English"** — Composer ($32/mo) — AI translates, doesn't reason

Atlas is the first retail AI trading assistant that:
1. **Shows its thinking** — structured multi-agent reasoning traces at every step
2. **Lets you control how much authority it has** — three configurable execution modes
3. **Operates on US equities** — nearly all bot competitors are crypto-native
4. **Targets swing trading** — days-to-weeks timeframe, underserved vs HFT and day trading tools
5. **Exposes a developer API** — OpenAPI docs, webhooks, designed for AI agent integration

### Key industry trends supporting Atlas

- EU pushing Explainable AI (XAI) requirements for financial systems
- Growing regulatory demands for auditable AI decision-making
- "Black box problem" is the #1 cited concern in retail AI trading
- Multi-agent pipelines (Research → Risk → Execution) identified as future of trading AI — Atlas builds this today
- 89% of global trading volume is AI-driven; retail tools lag institutional in transparency
- OpenClaw ecosystem (250K+ GitHub stars) spawned trading skills, but they're execution wrappers with no intelligence — "giving an LLM $2,000 to trade based on vibes"

### What Atlas is NOT

- Not an OpenClaw skill (security risk — ClawHavoc incident, Feb 2026)
- Not a day trading tool (swing trading, days-to-weeks)
- Not a black box (full reasoning traces, configurable authority)
- Not crypto-first (US equities via Alpaca/IBKR)

---

## 6. Technical Architecture

### Architecture Principle: API-First, GUI-Second

Every feature is an API endpoint first, then wrapped in a UI. Three consumption layers:
1. **REST API** with OpenAPI 3.1 docs (auto-generated via FastAPI at `/docs`)
2. **Webhooks** for push notifications (future: trade signals, executions, risk alerts)
3. **Next.js dashboard** as the reference frontend for retail users

### Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4 | ✅ Deployed (Vercel) |
| Backend | FastAPI, Python 3.11+, uv, Docker | ✅ Deployed (Render) |
| Agents | LangGraph StateGraph, Gemini 2.5 Flash | ✅ Live |
| Relational DB | PostgreSQL via Supabase | ⚠️ Schema deployed, not used by app |
| Document DB | MongoDB Atlas | ✅ Active (reasoning traces) |
| Broker | Alpaca (paper trading) | ✅ Connected |
| Broker (future) | IBKR (production/real money) | ❌ Not started |

### LLM Strategy

- **Quick-think** (Gemini 2.5 Flash): All analyst agents, synthesis
- **Deep-think** (Gemini 2.5 Flash — should upgrade to Pro for synthesis/portfolio): Portfolio decision
- Factory pattern in `agents/llm/factory.py` — never call Gemini directly
- Provider-agnostic by design: can swap in Claude, GPT, or local models via env vars only

### Broker Abstraction

`backend/broker/` contains a `BrokerAdapter` protocol. `AlpacaAdapter` is the working implementation. `IBKRAdapter` is a future implementation of the same protocol. The rest of the system never touches broker APIs directly.

### Database Architecture

**Supabase (PostgreSQL)** — Structured, relational, RLS-enforced:

| Table | Purpose | Used? |
|-------|---------|-------|
| `profiles` | User prefs, `boundary_mode` | ❌ Not yet |
| `portfolios` | Paper portfolio, cash balance | ❌ Not yet |
| `positions` | Open positions | ❌ Not yet |
| `trades` | Trade history, execution status | ❌ Not yet |
| `override_log` | Autonomous mode override audit trail | ❌ Not yet |

Every table has `user_id`. RLS policies are active. The schema is multi-tenancy ready.

**MongoDB Atlas** — Unstructured agent reasoning traces:

| Collection | Purpose | Used? |
|------------|---------|-------|
| `reasoning_traces` | Full pipeline run per ticker | ✅ Active |

Each trace captures: per-agent outputs (signal, indicators, reasoning, model, latency), synthesis debate, risk parameters, final decision, execution status.

---

## 7. Repository Structure

Monorepo at `github.com/Atlas-Broker/main`, partitioned by deployment target:

```
atlas/
├── frontend/          → Vercel (Next.js 16, TypeScript, Tailwind)
├── backend/           → Render (FastAPI, Docker)
│   ├── api/routes/    Versioned endpoints (/v1/*)
│   ├── broker/        BrokerAdapter protocol + AlpacaAdapter
│   ├── boundary/      Execution Boundary Controller
│   └── services/      Business logic (pipeline, signals)
├── agents/            → Imported by backend as local package
│   ├── analysts/      Technical, Fundamental, Sentiment
│   ├── synthesis/     Bull/bear debate
│   ├── risk/          Deterministic risk rules
│   ├── portfolio/     Final decision agent
│   ├── memory/        Layered memory (short/medium/long term)
│   ├── llm/           LLM factory (Gemini, extensible)
│   └── orchestrator.py
├── database/          Shared schemas
│   ├── supabase/      SQL migrations + schema
│   └── mongo/         JSON schemas for traces
├── docs/              Architecture, this file
└── CLAUDE.md          Claude Code context
```

---

## 8. Capstone Timeline

| Phase | Period | Status |
|-------|--------|--------|
| Phase 1: System Design | 2–15 Mar | ✅ DONE — Architecture, repo scaffolded, schemas deployed, pipeline live |
| Phase 2: Core Agent Dev | 16 Mar – 12 Apr | 🔄 CURRENT — Pipeline works. Need evaluation framework + interim report |
| Phase 3: Backtesting | 13 Apr – 3 May | Not started |
| Phase 4: Broker Integration | 4–31 May | Partially done early (Alpaca connected) |
| Phase 5: UAT | 1–21 Jun | Not started |
| Phase 6: Refinement | 22 Jun – 5 Jul | Not started |
| Phase 7: Final Evaluation | 6–19 Jul | Not started |

### What's actually ahead of schedule

You've pulled Phase 4 work (broker integration) into Phase 2. The pipeline runs end-to-end with Alpaca paper trading already connected. This is unusual — most teams don't have broker integration until weeks 10-13. Use this in the interim report as evidence of execution velocity.

### What's behind or missing

- **Evaluation framework**: Not defined. You can't write the interim report without it.
- **Structured paper trading data**: You need 1-2 weeks of actual paper trading runs to show real results.
- **Business impact framing**: Prof Xu's feedback hasn't been addressed in the system design yet.
- **Backtesting engine**: No historical backtest capability exists. Pipeline only runs forward (live/paper).

---

## 9. Interim Report Strategy (Due 12 April 2026)

### The narrative

The interim report should tell this story: "We built a working multi-agent AI trading system that uniquely lets users configure execution authority — here's the system, here's the evaluation framework we'll use to test the hypothesis that different authority levels produce different performance and trust outcomes, and here's early evidence from paper trading."

### What to write

1. **Introduction & Problem Statement**: Retail AI trading tools are either signal-only or fully autonomous black boxes. No tool offers configurable execution authority with reasoning transparency. Frame via SG retail market (moomoo, Tiger, Syfe) + MAS AI governance.

2. **Literature Review**: TradingAgents (multi-agent architecture), FinMem (layered memory), AI-Trader (benchmarking LLMs in trading), plus the competitive analysis (Trade Ideas, Composer, 3Commas, OpenClaw ecosystem).

3. **System Design**: Architecture diagram, agent pipeline, EBC design, database schema, broker abstraction. This is your strongest section — the system is built and working.

4. **Implementation Progress**: Show what's live with screenshots. Pipeline run example, reasoning trace document, signal approval flow, Alpaca order placement. Include latency data per agent node.

5. **Evaluation Framework**: Define metrics (quantitative: Sharpe, drawdown, return, latency, override frequency; qualitative: trust, regret, reasoning clarity). Define what "optimal" means as a composite score. Design UAT protocol.

6. **Early Results**: Run 5-10 paper trading sessions across different tickers and all three modes. Show the reasoning traces. Even if returns are flat, the data demonstrates the system works.

7. **Remaining Work**: Gaps 1-5, backtesting engine, UAT execution, final evaluation.

### What NOT to do

- Don't apologise for gaps. Frame them as "Phase 3-5 scope" — they're on the timeline.
- Don't oversell returns. Paper trading for 2 weeks won't produce meaningful alpha. Show the system works, not that it makes money.
- Don't bury the EBC. It's the academic contribution. Lead with it.

---

## 10. Evaluation Framework

### Quantitative Metrics (measured across all three modes)

| Metric | What it measures | Data source |
|--------|-----------------|-------------|
| Cumulative return | Raw performance | Alpaca account + Supabase trades |
| Sharpe ratio | Risk-adjusted return | Calculated from daily returns |
| Maximum drawdown | Worst peak-to-trough | Equity curve from trade history |
| Trade execution latency | Time from signal to order | MongoDB trace timestamps |
| Override frequency | How often humans intervene | Supabase override_log |
| Signal-to-execution rate | % of signals that become trades | MongoDB traces vs Alpaca orders |

### Qualitative Metrics (UAT, Phase 5)

| Metric | What it measures | Collection method |
|--------|-----------------|-------------------|
| User confidence | Trust in AI recommendations | Post-trade survey (Likert scale) |
| Decision regret | Hindsight satisfaction | Follow-up survey after trade outcome |
| Reasoning clarity | Perceived transparency | Rating of reasoning trace quality |
| Mode preference | Which mode users gravitate toward | Usage analytics + exit survey |

### Composite "Optimal Boundary" Score

The academic question is: **"What is the optimal human-agent execution boundary for retail AI-assisted trading?"**

"Optimal" = weighted combination of:
- Performance (Sharpe ratio, normalised)
- Risk control (max drawdown, inverse normalised)
- User trust (qualitative score, normalised)
- Execution efficiency (latency + signal-to-execution rate)

Weights TBD during Phase 5, but the framework must be defined in the interim report so the evaluation is credible.

---

## 11. Product Roadmap (Post-Capstone)

### Phase A: Close the 5 gaps (April–May 2026)

| Gap | Priority | Effort |
|-----|----------|--------|
| Auth integration | P0 | 1 week |
| Trade history sync to Supabase | P0 | 3 days |
| Override window | P0 | 3 days |
| Mode persistence | P1 | 1 day |
| Signal rejection logging | P2 | 1 day |

### Phase B: Product hardening (June 2026)

- Error handling throughout (API errors, broker failures, LLM timeouts)
- Rate limiting on API
- Proper loading/error states in dashboard
- Mobile-responsive frontend
- Onboarding flow for new users

### Phase C: Go to market (July–August 2026)

- Stripe integration for subscriptions
- Free tier (Advisory), Pro ($30-50/mo, Conditional), Premium ($80-120/mo, Autonomous)
- Landing page with demo video
- Developer API docs portal
- IBKR adapter for real money trading

### Phase D: Expansion (Post-graduation)

- V2: Crypto markets (Binance/Bybit adapter)
- V3: Natural language strategy creation
- V4: Multi-broker support (subscribers bring their own broker)
- V5: Social features — share reasoning traces, copy signals

---

## 12. Key Academic References

| Paper | Relevance |
|-------|-----------|
| **TradingAgents** (arxiv 2412.20138) | Multi-agent pipeline with specialised roles. Atlas borrows analyst-researcher-trader structure, adds EBC. |
| **FinMem** (arxiv 2311.13743) | Layered memory (short/medium/long-term). Atlas implements for swing trading timeframes. |
| **AI-Trader** (HKUDS, arxiv 2512.10971) | Benchmark comparing LLM trading performance. Template for cross-mode evaluation. |
| **TradeTrap** (Yanlewen/TradeTrap) | Security in AI trading. Important for risk/ethics discussion. |
| **TwinMarket** (FreedomIntelligence) | Market simulation. Potential for synthetic stress tests. |
| Multimodal Foundation (arxiv 2402.18485) | Future: visual chart reading by multimodal LLMs. |

### Open Source References

- https://github.com/TauricResearch/TradingAgents
- https://github.com/HKUDS/AI-Trader
- https://github.com/astronights/A4-Trading
- https://github.com/EthanAlgoX/LLM-TradeBot
- https://github.com/FreedomIntelligence/TwinMarket
- https://github.com/Yanlewen/TradeTrap

---

## 13. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 2026 | Alpaca as primary broker (paper) | Free tier, clean API, news data, resets anytime |
| Mar 2026 | IBKR for production | Deepest market access, lowest commissions, available in Singapore |
| Mar 2026 | MongoDB for traces, Supabase for structured data | Traces are nested/variable; relational data needs ACID + RLS |
| Mar 2026 | LangGraph for orchestration | Native parallel execution for analyst team |
| Mar 2026 | Gemini 2.5 Flash as initial LLM | Cost-effective, fast, structured JSON output |
| Mar 2026 | US Equities only for V1 | OpenClaw/bot ecosystem is crypto-native; US equities + swing trading = uncontested |
| Mar 2026 | "Product Atlas" not "Project Atlas" | A project ends. A product compounds. |
| Mar 2026 | Repo: Atlas-Broker/main | Monorepo, partitioned by deployment target |
| Mar 2026 | API-first architecture | Dashboard is one client; developer API and AI agents are others |

---

## 14. Scope Boundaries

### In Scope (Capstone)

- Multi-agent trading pipeline (5 agents via LangGraph) ✅ DONE
- Configurable Execution Boundary Controller ✅ DONE
- Paper trading with Alpaca ✅ DONE
- Reasoning trace logging (MongoDB) ✅ DONE
- Next.js dashboard ✅ DONE (functional, no auth)
- Historical backtesting engine ❌ NOT STARTED
- Structured UAT ❌ NOT STARTED
- Comparative evaluation across modes ❌ NOT STARTED
- Interim report ❌ NOT STARTED (due 12 April)

### Out of Scope (Capstone, but designed for in architecture)

- Multi-broker benchmarking
- Public SaaS deployment / payments
- Multi-user infrastructure (but `user_id` exists from day one)
- Real capital deployment
- Crypto markets
- UI polish beyond functional demonstration

---

*Last updated: 13 March 2026*  
*Maintained by: Lin Zhenming (Edmund)*  
*Next update: After interim report submission (12 April 2026)*
