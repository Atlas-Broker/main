# Product Atlas — Full Context Briefing

> Single source of truth for all development work. Updated 16 March 2026.
>
> **Naming**: This is a **Product**, not a Project. A project ends. A product compounds.

---

## 1. What is Atlas?

Atlas is simultaneously a **final year capstone** (BAC3004, Singapore Institute of Technology) and a **real B2C product**.

1. **Academic**: Score well on the capstone. Interim report due **12 April 2026**, final report due **19 July 2026**.
2. **Product**: Subscription-based AI trading assistant for retail investors. Dogfood it first — use Atlas to earn first stock market profits via swing trading (days-to-weeks). Once validated, roll out as a monthly subscription.

Architecture is **product-ready from day one**. Capstone uses paper trading, but every decision assumes real money and real users are coming.

**Full title**: Agentic AI Support System for Investment and Trading  
**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

---

## 2. The People

| Role | Name | Contact | Notes |
|------|------|---------|-------|
| Student | Lin Zhenming (Edmund) | 2302993@sit.singaporetech.edu.sg | Applied Computing Fintech, Matriculation 2302993 |
| Academic Supervisor | Xu Bing Jie | bingjie.xu@singaporetech.edu.sg | Key feedback: needs stronger business/finance domain impact. Frame via MAS regulations, SGX investor protection, SG retail platform transparency gap. |
| Industry Supervisor | Chin Wei Shan | wei.shan.chin@prudential.com.sg | AI Engineer, Prudential Singapore. Feedback: direction and purpose well thought out. |

Edmund is concurrently an AI Engineering Intern at Prudential, 40h/week, Jan–Aug 2026. Atlas is built in parallel.

---

## 3. Core Concept: The Execution Boundary Controller

Atlas is a **multi-agent AI trading system** whose unique differentiator is the **Execution Boundary Controller (EBC)** — a configurable mechanism governing how much authority the AI has over trade execution.

| Mode | Behavior | Product Tier | Confidence Threshold | Current State |
|------|----------|--------------|---------------------|---------------|
| **Advisory** | AI generates signals; human executes manually | Free | N/A | ✅ Working |
| **Conditional** | AI proposes trades; human must approve | Pro ($30–50/mo) | ≥ 60% | ✅ Working |
| **Autonomous** | AI executes automatically; human has override window | Premium ($80–120/mo) | ≥ 65% | ⚠️ Executes, but override not wired |

The trading logic is **identical** across all three modes. Only the execution authority changes. This enables controlled academic comparison AND creates natural pricing tiers.

The EBC is Atlas's primary moat. No existing retail platform — not Trade Ideas, not Composer, not 3Commas, not any OpenClaw skill — offers a configurable execution authority boundary. They are all binary: the bot trades, or it doesn't.

---

## 4. Current Build State (16 March 2026)

### What's live and working

**Agent Pipeline** — Fully operational. LangGraph `StateGraph` runs three analyst agents in parallel (fan-out), fans in to synthesis, risk, and portfolio decision. All nodes are real implementations. All LLM calls use Gemini 2.5 Flash with structured JSON output (`response_mime_type="application/json"`). Latency tracked per node.

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

**Agent detail**:
- **Technical Analyst**: RSI, 20/50-day SMA, price change %, volume trend → Gemini structured signal
- **Fundamental Analyst**: P/E, EPS growth, debt/equity, analyst targets → Gemini structured signal
- **Sentiment Analyst**: News headline tone, key themes → Gemini sentiment score
- **Synthesis Agent**: Bull case + bear case → unified trade thesis with confidence weighting
- **Risk Agent**: Deterministic — 2% portfolio risk rule, stop-loss from support or 5% fixed, 2:1 R/R take-profit
- **Portfolio Decision Agent**: Final BUY/SELL/HOLD + confidence score (0–1)

**Execution Boundary Controller** — Three modes with confidence thresholds. Advisory returns signal only. Conditional marks `awaiting_approval`. Autonomous executes immediately at ≥ 65%.

**Broker Adapter** — Protocol-based `BrokerAdapter` with working `AlpacaAdapter`. Places market orders, fetches equity/cash/positions. IBKR is a future implementation of the same protocol.

**Backend API** (FastAPI, deployed on Render):

| Endpoint | Status |
|----------|--------|
| `POST /v1/pipeline/run` | ✅ Live — full pipeline execution |
| `GET /v1/portfolio` | ✅ Live — real Alpaca account data |
| `GET /v1/signals` | ✅ Live — recent signals from MongoDB |
| `POST /v1/signals/{id}/approve` | ✅ Live — places Alpaca order, idempotent |
| `POST /v1/signals/{id}/reject` | ❌ Stub — not persisted |
| `GET /v1/trades` | ❌ Stub — mock data |
| `POST /v1/trades/{id}/override` | ❌ Stub — Alpaca cancel not wired |

**Frontend** (Next.js 16, deployed on Vercel):
- `/` — Landing page with ticker tape, execution mode explainer
- `/dashboard` — 4 tabs: Overview, Signals, Positions, Settings. Calls live backend. Signal approval wired. Theme toggle working.
- `/admin` — Desktop sidebar. Manual pipeline trigger, system status.

**Databases**:
- **MongoDB Atlas** — `reasoning_traces` collection active. Every pipeline run writes a full trace. Powers signals list. ✅
- **Supabase (PostgreSQL)** — 5 tables deployed with RLS policies, `user_id` on every table (multi-tenancy ready). **Not yet used by the app** — state lives in Alpaca + MongoDB. ⚠️

**UAT URLs**:
- Backend: `https://atlas-broker-backend-uat.onrender.com`
- Frontend: `https://atlas-broker-frontend-uat.vercel.app`

### The five gaps

Ordered by severity. Gaps 1–3 are blockers for any real usage.

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| 1 | **Auth not integrated** — anyone with the URL can view portfolio and approve trades | BLOCKER | Supabase Auth in frontend (login/signup, session, `useAuth`), JWT to backend, extract `user_id` for RLS |
| 2 | **Override window not implemented** — Autonomous mode has no emergency brake | BLOCKER | Wire `POST /v1/trades/{id}/override` to `broker.cancel_order()`, write to Supabase `override_log` |
| 3 | **Trade history not synced** — nothing writes to Supabase when trades execute | BLOCKER | On `approve_and_execute`, write to `supabase.trades` and update `supabase.positions` |
| 4 | **Execution mode not persisted** — selection lost on refresh | UX issue | Write to `profiles.boundary_mode` in Supabase, read on mount |
| 5 | **Signal rejection silent** — reject endpoint returns placeholder, doesn't persist | Minor | Log to MongoDB trace (`execution.rejected = true`) |

For the **interim report**, gaps are fine — frame as "Phase 3–5 scope."  
For **product launch**, gaps 1–3 must close first.

### Readiness assessment

| Dimension | Status | Detail |
|-----------|--------|--------|
| Interim report (12 Apr) | ✅ Strong | Core system works end-to-end. Needs evaluation framework, paper trading results, business impact framing. |
| Real user usage | ❌ Not ready | Gaps 1–3 are dealbreakers: no auth = liability, no trade history = no audit trail, no override = no emergency brake. |
| Product launch | ❌ Not ready | Needs auth, persistent trades, override, subscription/payments, onboarding, error hardening. |

### What's ahead of schedule

Broker integration (Phase 4, planned May) is already done in Phase 2. The pipeline runs end-to-end with Alpaca paper trading connected. Most capstone teams don't have this until weeks 10–13.

---

## 5. Competitive Positioning

### The gap Atlas fills

The retail AI trading market is split between:
- **"Here's a signal, figure it out"** — Trade Ideas Holly ($178–254/mo), TrendSpider, Tickeron. Black box signals.
- **"Give us your money, trust the black box"** — 3Commas, Cryptohopper, Pionex, WunderTrading. Zero transparency.
- **"Describe what you want in English"** — Composer ($32/mo). AI translates strategy, doesn't reason about markets.
- **"Give an LLM $2,000 to trade on vibes"** — OpenClaw ecosystem (250K+ stars). Execution wrappers with no intelligence.

No retail platform offers **configurable execution authority + full reasoning transparency**.

Atlas is the first retail AI trading assistant that:
1. **Shows its thinking** — structured multi-agent reasoning traces at every step
2. **Lets you control authority** — three configurable execution modes
3. **Targets US equities** — nearly all bot competitors are crypto-native
4. **Focuses on swing trading** — days-to-weeks, underserved vs HFT and day trading
5. **Exposes a developer API** — OpenAPI docs, designed for AI agent integration

### Detailed competitive landscape

| Platform | Model | Strength | Critical Weakness |
|----------|-------|----------|-------------------|
| **Trade Ideas / Holly AI** | $178–254/mo | 70+ strategies, backtested nightly | Total black box. No reasoning, no user control. |
| **Composer** | $32/mo | Natural language → strategy, $200M+ daily volume | AI translates, doesn't reason. No execution boundary. |
| **StockHero** | $29.99–99.99/mo | Alpaca-integrated, 100K+ users, marketplace | No multi-agent reasoning, no configurable authority. |
| **3Commas** | $20–200/mo | Multi-exchange, DCA/Grid, SmartTrade | Rule-based only, no AI reasoning. |
| **Cryptohopper** | $29–129/mo | Cloud-native, AI Strategy Designer | Black box, no transparency. |
| **NexusTrade (Aurora)** | Subscription | LLM as strategy engineer (correct framing) | Still binary execution, no EBC. |
| **OpenClaw skills** | Various | Massive ecosystem (250K+ stars) | Execution wrappers, no intelligence. Security risk (ClawHavoc). |
| **Institutional (LOXM, D.E. Shaw)** | N/A | Full explainability, audit trails | Inaccessible to retail. |

### Industry trends supporting Atlas

- EU pushing Explainable AI (XAI) requirements for financial systems
- Growing regulatory demands for auditable AI decision-making (Colorado AI Act 2026)
- "Black box problem" cited as #1 unsolved challenge in retail AI trading
- Multi-agent pipelines (Research → Risk → Execution) identified as future of trading AI
- 89% of global trading volume is AI-driven; retail tools lag institutional in transparency
- IOSCO 2025 report: 69% of financial firms believe AI deployment will introduce new compliance issues within 12 months

---

## 6. Agent Pipeline Architecture

Inspired by **TradingAgents** (arxiv 2412.20138) with Atlas's unique EBC. Memory design from **FinMem** (arxiv 2311.13743).

### Current Pipeline (v2 — Sequential LangGraph)

```
Market Data (yfinance: OHLCV, fundamentals, news)
    ↓
Analysis Team [parallel via LangGraph fan-out]
  ├── Technical Analyst — RSI, SMA, price action, volume
  ├── Fundamental Analyst — P/E, EPS growth, debt/equity, analyst targets
  └── Sentiment Analyst — news headlines, LLM sentiment scoring
    ↓ fan-in
Synthesis Agent — bull/bear debate, unified trade thesis, confidence weighting
    ↓
Risk Management Agent — 2% portfolio risk, stop-loss, take-profit (2:1 R/R)
    ↓
Portfolio Decision Agent — final BUY/SELL/HOLD + confidence score
    ↓
Execution Boundary Controller — routes by mode (Advisory/Conditional/Autonomous)
    ↓
Broker Adapter — Alpaca (paper) | IBKR (production, future)
```

Each agent outputs structured JSON. Every pipeline run writes a full reasoning trace to MongoDB.

### Planned: v3 — Adaptive Conductor (Post-Interim)

Professor suggested a dynamic conductor/meta-agent that decides which pipeline steps to skip, repeat, or emphasise based on market conditions and confidence levels.

Plan: abstract into `agents/graphs/sequential.py` (v2) and `agents/graphs/adaptive.py` (v3), with `conductor.py` as meta-agent. `orchestrator.py` becomes a factory. Build v2 fully first.

### Planned: Philosophy Skills (AlphaClaw-Inspired)

Inspired by 熵简科技 (Entropy Simplified Technology) AlphaClaw methodology. Three enhancements:

**1. Named Investment Philosophies for Analysts**

Instead of generic "technical/fundamental/sentiment" agents, each analyst embodies a named investment framework:
- Value Analyst (Buffett-style: intrinsic value, margin of safety, moat)
- Momentum Analyst (trend-following: RSI breakouts, volume surges, relative strength)
- Macro Analyst (top-down: sector rotation, interest rates, geopolitical risk)

The synthesis agent reconciles *philosophical disagreement* — a value analyst might say SELL (overvalued P/E) while momentum says BUY (strong uptrend). The debate becomes richer and reasoning traces more transparent.

**2. SEC EDGAR Integration**

Fundamental analyst reasons over actual 10-Q/10-K filing text via the free public EDGAR API, not just yfinance summary numbers. Gives agents real source documents to cite in reasoning traces — critical for the transparency claim.

**3. Skill Persistence (Strategy Configurations)**

Users save named strategy configurations in Supabase with custom risk weights:
- "Conservative Growth" = 60% fundamental, 20% technical, 20% sentiment
- "Momentum Swing" = 20% fundamental, 50% technical, 30% sentiment

Adds a **third experimental axis** for academic research:
- Axis 1: EBC modes (Advisory / Conditional / Autonomous)
- Axis 2: Orchestration version (v2 sequential / v3 adaptive conductor)
- Axis 3: Philosophy Skills (strategy configurations with different analyst weightings)

---

## 7. Reasoning Trace Structure

MongoDB document per pipeline run:

```json
{
  "trace_id": "uuid",
  "user_id": "uuid",
  "ticker": "AAPL",
  "boundary_mode": "conditional",
  "created_at": "ISO8601",
  "pipeline_run": {
    "analysts": {
      "technical": {
        "signal": "BUY",
        "confidence": 0.72,
        "indicators": { "rsi": 45.2, "sma_20": 182.5, "sma_50": 178.3 },
        "reasoning": "...",
        "model": "gemini-2.5-flash",
        "latency_ms": 1200
      },
      "fundamental": { "..." },
      "sentiment": { "..." }
    },
    "synthesis": {
      "bull_case": "...",
      "bear_case": "...",
      "verdict": "BUY",
      "confidence": 0.65
    },
    "risk": {
      "stop_loss": 175.00,
      "take_profit": 195.00,
      "position_size_pct": 0.05,
      "risk_reward_ratio": 2.0
    },
    "final_decision": {
      "action": "BUY",
      "confidence": 0.65,
      "reasoning": "..."
    }
  },
  "execution": {
    "executed": true,
    "order_id": "alpaca-order-id",
    "override": false
  }
}
```

---

## 8. Technical Architecture

### Principle: API-First, GUI-Second

Every feature is an API endpoint first, then wrapped in UI. Three consumption layers:
1. **REST API** with OpenAPI 3.1 docs (auto-generated at `/docs`)
2. **Webhooks** for push notifications (future: signals, executions, risk alerts)
3. **Next.js dashboard** as reference frontend for retail users

### Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 16, TypeScript, Tailwind v4 | ✅ Deployed (Vercel) |
| Backend | FastAPI, Python 3.11+, uv, Docker | ✅ Deployed (Render) |
| Agents | LangGraph StateGraph, Gemini 2.5 Flash | ✅ Live |
| Relational DB | PostgreSQL via Supabase (RLS) | ⚠️ Schema deployed, not used by app |
| Document DB | MongoDB Atlas | ✅ Active |
| Broker (dev) | Alpaca paper trading | ✅ Connected |
| Broker (prod) | IBKR | ❌ Not started |

### LLM Strategy

- **Quick-think** (Gemini 2.5 Flash): All analyst agents, synthesis
- **Deep-think** (Gemini 2.5 Flash — upgrade to Pro for synthesis/portfolio)
- Factory pattern in `agents/llm/factory.py` — never call Gemini directly
- Provider-agnostic: swap to Claude, GPT, or local models via env vars

### Broker Abstraction

`backend/broker/base.py` defines `BrokerAdapter` protocol. `AlpacaAdapter` is live. `IBKRAdapter` is future. System never touches broker APIs outside this module.

### Database Architecture

**Supabase (PostgreSQL)** — Structured, RLS-enforced, `user_id` on every table:

| Table | Purpose | Used? |
|-------|---------|-------|
| `profiles` | User prefs, `boundary_mode` | ❌ |
| `portfolios` | Cash balance tracking | ❌ |
| `positions` | Open positions | ❌ |
| `trades` | Trade history, execution status | ❌ |
| `override_log` | Autonomous mode audit trail | ❌ |

**MongoDB Atlas**:

| Collection | Purpose | Used? |
|------------|---------|-------|
| `reasoning_traces` | Full pipeline run per ticker | ✅ Active |

### Memory Architecture (FinMem-inspired, not yet implemented)

Layered memory in MongoDB:
- **Short-term**: Intraday signals, recent price movements, current positions
- **Medium-term**: Weekly patterns, sector rotation, recent trade outcomes
- **Long-term**: Market regime knowledge, historical strategy performance

---

## 9. Repository Structure

Monorepo at `github.com/Atlas-Broker/main`:

```
atlas/
├── frontend/              → Vercel
│   ├── app/               Next.js 16 app router
│   ├── components/        ThemeProvider, dashboard tabs
│   └── lib/
├── backend/               → Render (Docker)
│   ├── api/routes/        /v1/* endpoints
│   ├── broker/            BrokerAdapter protocol + AlpacaAdapter
│   ├── boundary/          EBC (controller.py, modes.py)
│   ├── services/          Pipeline + signals business logic
│   └── main.py            FastAPI entrypoint
├── agents/                → Imported by backend as local package
│   ├── analysts/          Technical, Fundamental, Sentiment
│   ├── synthesis/         Bull/bear debate
│   ├── risk/              Deterministic risk rules
│   ├── portfolio/         Final decision agent
│   ├── memory/            Layered memory (short/medium/long)
│   ├── llm/               Factory pattern (Gemini, extensible)
│   ├── data/market.py     yfinance wrapper
│   ├── state.py           AgentState TypedDict
│   ├── graph.py           StateGraph definition
│   └── orchestrator.py    Entry points
├── database/              Shared schemas
│   ├── supabase/          SQL migrations + schema
│   └── mongo/             JSON schemas for traces
├── docs/                  This file, architecture docs
├── CLAUDE.md              Claude Code context
└── README.md
```

---

## 10. Capstone Timeline

| Phase | Period | Status |
|-------|--------|--------|
| Phase 1: System Design | 2–15 Mar | ✅ DONE |
| Phase 2: Core Agent Dev | 16 Mar – 12 Apr | 🔄 CURRENT |
| Phase 3: Backtesting & Strategy Refinement | 13 Apr – 3 May | Not started |
| Phase 4: Broker Paper Trading | 4–31 May | ✅ Done early (Alpaca in Phase 2) |
| Phase 5: UAT | 1–21 Jun | Not started |
| Phase 6: Refinement | 22 Jun – 5 Jul | Not started |
| Phase 7: Final Evaluation & Reporting | 6–19 Jul | Not started |

---

## 11. Interim Report Strategy (Due 12 April)

### The narrative

"We built a working multi-agent AI trading system that uniquely lets users configure execution authority. Here's the system, here's the evaluation framework for testing that different authority levels produce different performance and trust outcomes, and here's early evidence from paper trading."

### Sections to write

1. **Introduction & Problem Statement**: Retail AI tools are signal-only or fully autonomous black boxes. No configurable authority with reasoning transparency. Frame via SG retail market (moomoo, Tiger, Syfe) + MAS AI governance.
2. **Literature Review**: TradingAgents (multi-agent), FinMem (layered memory), AI-Trader (benchmarking), AlphaClaw (philosophy skills), competitive analysis.
3. **System Design**: Architecture diagram, agent pipeline, EBC design, database schema, broker abstraction. Strongest section — system is built.
4. **Implementation Progress**: Screenshots. Pipeline run, reasoning trace, signal approval, Alpaca order. Per-node latency data.
5. **Evaluation Framework**: Quantitative + qualitative metrics. Composite "optimal boundary" score. UAT protocol design.
6. **Early Results**: 5–10 paper trading runs across tickers and all three modes. Show reasoning traces.
7. **Remaining Work**: Gaps as "Phase 3–5 scope." Backtesting, UAT, final evaluation.

### What NOT to do

- Don't apologise for gaps — they're on the timeline
- Don't oversell returns — show the system works, not that it makes money
- Don't bury the EBC — it's the academic contribution, lead with it

---

## 12. Evaluation Framework

### Quantitative Metrics (across all three modes)

| Metric | Measures | Data Source |
|--------|----------|-------------|
| Cumulative return | Raw performance | Alpaca + Supabase trades |
| Sharpe ratio | Risk-adjusted return | Daily returns calculation |
| Maximum drawdown | Worst peak-to-trough | Equity curve from trade history |
| Trade execution latency | Signal-to-order time | MongoDB trace timestamps |
| Override frequency | Human intervention rate | Supabase override_log |
| Signal-to-execution rate | % signals becoming trades | MongoDB vs Alpaca orders |

### Qualitative Metrics (UAT, Phase 5)

| Metric | Measures | Method |
|--------|----------|--------|
| User confidence | Trust in AI recommendations | Post-trade Likert survey |
| Decision regret | Hindsight satisfaction | Follow-up after trade outcome |
| Reasoning clarity | Perceived transparency | Rating of trace quality |
| Mode preference | Where users gravitate | Usage analytics + exit survey |

### Composite "Optimal Boundary" Score

Academic question: **"What is the optimal human-agent execution boundary for retail AI-assisted trading?"**

"Optimal" = weighted combination of:
- Performance (Sharpe ratio, normalised)
- Risk control (max drawdown, inverse normalised)
- User trust (qualitative score, normalised)
- Execution efficiency (latency + signal-to-execution rate)

### Three Experimental Axes

| Axis | Variable | Levels |
|------|----------|--------|
| EBC Mode | Execution authority | Advisory, Conditional, Autonomous |
| Orchestration | Pipeline intelligence | v2 sequential, v3 adaptive conductor |
| Philosophy Skills | Analyst frameworks | Value/Momentum/Macro weightings |

---

## 13. Product Roadmap

### Phase A: Close the 5 gaps (April–May 2026)

| Gap | Priority | Effort |
|-----|----------|--------|
| Auth integration | P0 | 1 week |
| Trade history sync to Supabase | P0 | 3 days |
| Override window | P0 | 3 days |
| Mode persistence | P1 | 1 day |
| Signal rejection logging | P2 | 1 day |

### Phase B: Product hardening (June 2026)

Error handling, rate limiting, loading/error states, mobile-responsive, onboarding flow.

### Phase C: Go to market (July–August 2026)

Stripe subscriptions (Free/Pro/Premium), landing page + demo video, developer API docs portal, IBKR adapter for real money.

### Phase D: Expansion (post-graduation)

V2: Crypto (Binance/Bybit). V3: NLP strategy creation. V4: Multi-broker. V5: Social features (share traces, copy signals).

---

## 14. Key Academic References

| Paper | Relevance |
|-------|-----------|
| **TradingAgents** (arxiv 2412.20138, Tauric Research) | Multi-agent pipeline. Atlas borrows analyst-researcher-trader structure, adds EBC. |
| **FinMem** (arxiv 2311.13743) | Layered memory (short/medium/long-term) for trading agents. |
| **AI-Trader** (HKUDS, arxiv 2512.10971) | Benchmark comparing LLM trading performance. Template for cross-mode evaluation. |
| **AlphaClaw** (熵简科技) | Philosophy Skills — named investment frameworks for analyst agents. |
| **TradeTrap** (Yanlewen/TradeTrap) | Security in AI trading. Risk/ethics discussion. |
| **TwinMarket** (FreedomIntelligence) | Market simulation for stress testing. |
| Multimodal Foundation (arxiv 2402.18485) | Future: visual chart reading by multimodal LLMs. |

### Open Source References

- https://github.com/TauricResearch/TradingAgents
- https://github.com/HKUDS/AI-Trader
- https://github.com/astronights/A4-Trading
- https://github.com/EthanAlgoX/LLM-TradeBot
- https://github.com/FreedomIntelligence/TwinMarket
- https://github.com/Yanlewen/TradeTrap

---

## 15. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 2026 | "Product Atlas" not "Project Atlas" | A project ends. A product compounds. |
| Mar 2026 | Alpaca as primary broker (paper) | Free tier, clean API, news data, resets anytime |
| Mar 2026 | IBKR for production | Deepest market access, lowest commissions, available in Singapore |
| Mar 2026 | MongoDB for traces, Supabase for structured data | Traces are nested/variable; relational data needs ACID + RLS |
| Mar 2026 | LangGraph for orchestration | Native parallel execution for analyst team |
| Mar 2026 | Gemini 2.5 Flash as initial LLM | Cost-effective, fast, structured JSON output |
| Mar 2026 | US Equities only for V1 | Bot ecosystem is crypto-native; US equities + swing trading = uncontested |
| Mar 2026 | API-first architecture | Dashboard is one client; developer API and AI agents are others |
| Mar 2026 | EBC cannot slip | Academic novelty + product moat in one component |
| Mar 2026 | Philosophy Skills as third experimental axis | Inspired by AlphaClaw (熵简科技); adds depth to evaluation |

---

## 16. Scope Boundaries

### In Scope (Capstone)

| Item | Status |
|------|--------|
| Multi-agent pipeline (5 agents via LangGraph) | ✅ Done |
| Configurable Execution Boundary Controller | ✅ Done |
| Paper trading with Alpaca | ✅ Done |
| Reasoning trace logging (MongoDB) | ✅ Done |
| Next.js dashboard | ✅ Done (functional, no auth) |
| Historical backtesting engine | ❌ Not started |
| Structured UAT | ❌ Not started |
| Comparative evaluation across modes | ❌ Not started |
| Interim report | ❌ Not started (due 12 April) |

### Out of Scope (Capstone, but designed for)

Multi-broker benchmarking, public SaaS/payments, multi-user infrastructure (but `user_id` exists), real capital, crypto, UI polish beyond functional.

---

*Last updated: 16 March 2026*  
*Maintained by: Lin Zhenming (Edmund)*  
*Next update: After interim report submission (12 April 2026)*
