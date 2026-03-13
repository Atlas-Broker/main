# Project Atlas — Full Context Briefing

> This document captures the complete context of Product Atlas as discussed between Lin Zhenming (Edmund) and Claude (chat interface) in March 2026. Use this as the source of truth for all development work.
>
> **Note on naming**: This is deliberately called a **Product**, not a Project. A project ends. A product compounds. Every design and build decision should reflect that intent.

---

## 1. What is Atlas?

Atlas is simultaneously a **final year capstone project** (BAC3004 at Singapore Institute of Technology) and a **real B2C product**. The dual intent is:

1. **Academic**: Score well on the capstone. Interim report due 12 April 2026, final report due 19 July 2026.
2. **Product**: Build a subscription-based AI trading assistant for retail investors. Dogfood it first (use Atlas to earn first stock market profits via swing trading), then roll out as a monthly subscription service.

The architecture must be **product-ready from day one**. The capstone uses paper trading only, but every design decision should assume real money and real users are coming.

**Full title**: Agentic AI Support System for Investment and Trading
**Academic framing**: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

---

## 2. The People

- **Student**: Lin Zhenming (Edmund), Matriculation 2302993, Applied Computing Fintech, SIT
- **Academic Supervisor**: Xu Bing Jie (bingjie.xu@singaporetech.edu.sg) — Assistant Professor at SIT. Feedback: technical complexity is appropriate, but needs stronger business/finance domain impact considerations. Frame around MAS regulations, SGX investor protection, and the transparency gap in Singapore retail trading platforms (moomoo, Tiger Brokers, Syfe Trade).
- **Industry Supervisor**: Chin Wei Shan (wei.shan.chin@prudential.com.sg) — AI Engineer at Prudential Singapore. Feedback: direction and purpose well thought out.
- **Organization**: Prudential Assurance Company Singapore (Edmund is concurrently an AI Engineering Intern here, 40h/week, Jan–Aug 2026)

---

## 3. Core Concept

Atlas is a **multi-agent AI trading system** with a unique differentiator: the **Execution Boundary Controller (EBC)** — a configurable mechanism that lets users choose how much authority the AI has over trade execution.

### Three Execution Modes (the experimental variable AND pricing moat):

| Mode | Behavior | Product Tier |
|------|----------|--------------|
| **Advisory** | AI generates recommendations; human executes manually | Free tier |
| **Conditional** | AI proposes trades; execution requires explicit human approval | Mid tier |
| **Autonomous** | AI executes automatically; human has override window | Premium tier |

The key insight: the trading logic remains **identical** across all three modes. Only the execution authority changes. This enables controlled comparison for the academic evaluation AND creates natural pricing tiers for the product.

The EBC is Atlas's primary moat. No existing retail platform — not NexusTrade, not 3Commas, not Cryptohopper — offers a configurable execution authority boundary. They are all binary: either the bot trades, or it doesn't.

---

## 4. Market & Competitive Landscape (Updated March 2026)

### The OpenClaw Ecosystem (New, March 2026)

OpenClaw (formerly Clawdbot/Moltbot) is an open-source AI agent that reached 250,000+ GitHub stars in under 60 days and spawned a large ecosystem of trading skills. As of March 2026, its ClawHub marketplace hosts 13,700+ skills, with 311+ in the finance/investing category.

**Key OpenClaw trading tools:**
- **BankrBot**: Crypto trading across Base, Ethereum, Polygon, Solana. Natural language → on-chain execution. No position limits, no confirmation, no reasoning transparency. 0.8% per trade fee.
- **Alpaca Skill**: Natural language → US equity orders via Alpaca API. Execution wrapper with no intelligence.
- **Polyclaw**: Polymarket prediction market trading. Arbitrage windows have compressed to 2.7 seconds; 92.4% of Polymarket traders lose money.

**Critical weakness of the OpenClaw approach**: These are execution wrappers, not intelligence systems. There is no reasoning, no debate, no configurable control. The most honest summary of the space: people are "giving an LLM $2,000 to trade based on vibes."

**Security note for codebase**: The OpenClaw ecosystem suffered ClawHavoc (Feb 2026) — 1,184 malicious skills in the official marketplace, ~20% of all skills were malicious at peak. Atlas must never be distributed as an OpenClaw skill.

### Established Bots (Pre-OpenClaw)

| Platform | Model | Strength | Critical Weakness |
|----------|-------|----------|-------------------|
| **Pionex** | Free, exchange-integrated | 16 built-in bots, 0.05% fees, beginner-friendly | No reasoning, locked to one exchange |
| **3Commas** | $20–200/month | Multi-exchange, DCA/Grid, SmartTrade | No AI reasoning, rule-based only |
| **Cryptohopper** | $29–129/month | Cloud-native, AI Strategy Designer, social copying | Black box, no transparency |
| **HaasOnline** | $20–100/month | HaasScript, institutional-grade, self-hostable | Expert-only, no retail UX |
| **NexusTrade (Aurora)** | Subscription | LLM as strategy engineer, not trader — correct framing | Still binary execution, no EBC |

### Signal Generators

- **Trade Ideas / Holly AI**: 70+ strategies, backtested nightly, zero reasoning transparency. $178–254/month. Black box.
- **Composer**: Natural language → trading algorithm. AI is a translator, not a thinker. $32/month.

### Institutional (Out of Reach for Retail)

- **JPMorgan LOXM, D.E. Shaw**: Full explainability and audit trails. Inaccessible to retail.

### The Gap Atlas Fills

No retail platform currently offers **configurable control over execution authority** combined with **full reasoning transparency**.

The market is split between:
- "Here's a signal, you figure it out" (signal generators)
- "Give us your money, trust the black box" (automated bots)

Atlas is the first retail AI trading assistant that:
1. **Shows its thinking** — structured multi-agent reasoning traces at every step
2. **Lets you control how much authority it has** — three configurable execution modes
3. **Operates on US equities** — almost all OpenClaw/bot competitors are crypto-native
4. **Targets swing trading** — days-to-weeks timeframe, underserved vs. HFT and day trading tools

### Industry Trends Supporting Atlas

- EU pushing Explainable AI (XAI) requirements for financial systems
- Growing regulatory demands for auditable AI decision-making
- The "black box problem" is explicitly cited as the #1 unsolved challenge in retail AI trading (see Skywork AI guide, March 2026)
- Multi-agent "meshes" where Research → Risk → Execution agents hand off sequentially are identified as the future of trading AI — Atlas builds this today
- 89% of global trading volume is AI-driven, but retail tools lag far behind institutional in transparency
- Crypto trading bot market valued at $54B in 2026, projected to reach $200B by 2035 (14% CAGR)

### What the "Smart Advice" Articles Actually Say (Researched March 2026)

Four major articles were reviewed and critically analysed. Summary for Claude Code context:

- **NexusTrade (Austin Starks)**: Directionally correct — LLMs should engineer strategies, not make discretionary trades. But it's founder content marketing. Aurora's 36.94% vs SPY 15.97% is a single cherry-picked backtest window, no out-of-sample validation shown.
- **Skywork AI Guide**: Technically sound step-by-step framework (define → backtest → risk management → paper trade → live). AI-generated SEO content. Statistics cited without sources.
- **West Africa Trade Hub bot comparison**: Affiliate review. Product specs are real (scraped from platforms). Performance claims are fabricated.
- **AurPay OpenClaw guide**: Ironically the most empirically honest — Polymarket 92.4% loss rate is real on-chain data, CVEs are verifiable, security warnings are real. Agenda is to sell payment infrastructure, not to help traders.

**The one legitimate, universal advice** across all sources: paper trade before live capital; backtest with fees and slippage included; never give API withdrawal permissions to any bot; LLMs are better at strategy engineering than discretionary decision-making.

---

## 5. Technical Decisions

### Market & Trading

- **Target market**: US Equities (primary). Crypto as V2 expansion.
- **Trading style**: Swing trading, multi-timeframe (days to weeks). Not day trading.
- **Broker (dev/paper)**: Alpaca — clean REST API, free paper trading, good historical data, news API included
- **Broker (production/real money)**: Interactive Brokers (IBKR) — deepest market access, lowest commissions, available in Singapore
- **Broker abstraction**: `BrokerAdapter` protocol with swappable implementations. System never touches broker directly.

### Architecture Principle: API-First, GUI-Second

Every feature is an API endpoint first, then wrapped in a UI. The product has three consumption layers:
1. **REST API** with OpenAPI 3.1 docs (auto-generated via FastAPI) — for developers and AI agents
2. **Webhooks** for push notifications (trade signals, executions, risk alerts)
3. **Next.js dashboard** as the reference frontend for retail users

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js + TypeScript | App router, deployed to Vercel |
| Backend/API | FastAPI (Python, async) | Auto-generates OpenAPI docs, Pydantic models for type-safe contracts, async-native for concurrent broker/LLM calls |
| Agent pipeline | Python + LangGraph | Agent orchestration, multi-agent coordination |
| Relational DB | PostgreSQL via Supabase | Users, trades, positions, portfolios, subscriptions, override logs. Row Level Security for multi-tenancy. Real-time subscriptions. Auth (JWT). |
| Document DB | MongoDB Atlas | Agent reasoning traces — deeply nested, variable-structure documents. Flexible schema for evolving agent outputs. |
| LLM Providers | Multi-provider (Claude, GPT, Gemini) | Factory pattern, provider-agnostic. Quick-think models for data retrieval, deep-think for analysis. |
| Market Data | Alpaca Data API (primary), Alpha Vantage / Finnhub (supplementary) | OHLCV, real-time quotes, news feeds, social sentiment |

### Database Design Principles

- Supabase schema has `user_id` column from day one (multi-tenancy ready)
- MongoDB reasoning traces tagged with user context
- Row Level Security enabled in Supabase for subscriber isolation
- Migrations managed in shared `database/` folder (both frontend and backend depend on same schema)

---

## 6. Agent Pipeline Architecture

Inspired by **TradingAgents** (Tauric Research, arxiv 2412.20138) but with Atlas's unique Execution Boundary Controller that no existing framework provides.

### Pipeline Flow:

```
Market Data (OHLCV + News + Sentiment feeds via Alpaca API)
    ↓
Analysis Team (runs concurrently via LangGraph parallel nodes)
  ├── Technical Analyst Agent    — RSI, MACD, moving averages, support/resistance
  ├── Fundamental Analyst Agent  — P/E, revenue trends, earnings surprises
  └── Sentiment Analyst Agent    — News headlines, LLM sentiment scoring
    ↓
    Each agent outputs: { ticker, direction, confidence, rationale }
    ↓
Synthesis Agent — bull/bear debate pattern, aggregates 3 analyst outputs,
                  produces unified trade thesis with confidence weighting
    ↓
Risk Management Agent — position sizing, max drawdown guard,
                        portfolio concentration check, stop-loss levels
    ↓
Portfolio Decision Agent — final BUY/SELL/HOLD with full structured reasoning trace
    ↓
Execution Boundary Controller (EBC) — routes based on configured mode:
  ├── Advisory:    surface recommendation + reasoning, no execution
  ├── Conditional: execute only if confidence ≥ threshold AND no override flag
  └── Autonomous:  execute directly, log everything, override window open
    ↓
Broker Adapter — Alpaca (paper/dev) | IBKR (production)
```

### Reasoning Trace Structure (MongoDB document per decision):

```json
{
  "trace_id": "uuid",
  "user_id": "uuid",
  "ticker": "AAPL",
  "timestamp": "ISO8601",
  "mode": "advisory|conditional|autonomous",
  "analyst_outputs": {
    "technical": { "direction": "BUY", "confidence": 0.72, "rationale": "..." },
    "fundamental": { "direction": "HOLD", "confidence": 0.55, "rationale": "..." },
    "sentiment": { "direction": "BUY", "confidence": 0.68, "rationale": "..." }
  },
  "synthesis": {
    "bull_case": "...",
    "bear_case": "...",
    "final_thesis": "...",
    "aggregate_confidence": 0.65
  },
  "risk_assessment": {
    "position_size": 0.05,
    "stop_loss": 0.03,
    "risk_flags": []
  },
  "decision": {
    "action": "BUY",
    "rationale": "...",
    "confidence": 0.65
  },
  "execution": {
    "executed": true,
    "order_id": "alpaca-order-id",
    "override": false
  }
}
```

### Memory Architecture (inspired by FinMem, arxiv 2311.13743):

Layered memory system stored in MongoDB Atlas:
- **Short-term memory**: Intraday signals, recent price movements, current positions
- **Medium-term memory**: Weekly patterns, sector rotation, recent trade outcomes
- **Long-term memory**: Market regime knowledge, historical strategy performance, learned preferences

### LLM Strategy:

- **Quick-think models** (Claude Haiku, Gemini Flash Lite): Data retrieval, initial scanning, simple classification — analyst agents
- **Deep-think models** (Claude Sonnet/Opus, Gemini Flash/Pro): Complex analysis, debate synthesis, final trade decisions — synthesis and risk agents
- Provider-agnostic via factory pattern — never locked to one vendor

---

## 7. Repository Structure

Monorepo partitioned by deployment target:

```
atlas/                          # Atlas-Broker/atlas
├── frontend/                   # → Deploys to Vercel
│   ├── app/                    # Next.js app router
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
│
├── backend/                    # → Deploys to Render (or Railway, Fly.io)
│   ├── api/
│   │   ├── routes/             # /v1/signals, /v1/trades, /v1/portfolio
│   │   ├── middleware/         # Auth, rate limit, CORS
│   │   └── dependencies/
│   ├── services/               # Business logic the API calls
│   ├── broker/
│   │   ├── base.py             # BrokerAdapter protocol
│   │   ├── alpaca.py
│   │   ├── ibkr.py
│   │   └── factory.py
│   ├── boundary/               # Execution Boundary Controller
│   │   ├── controller.py
│   │   └── modes.py
│   ├── main.py                 # FastAPI entrypoint
│   ├── pyproject.toml
│   └── Dockerfile
│
├── agents/                     # → Separate worker / imported by backend
│   ├── analysts/
│   │   ├── technical.py        # RSI, MACD, moving averages, support/resistance
│   │   ├── fundamental.py      # P/E, revenue, earnings (Financial Modeling Prep / Alpha Vantage)
│   │   └── sentiment.py        # News via Alpaca News API, LLM sentiment scoring
│   ├── synthesis/              # Bull/bear debate, aggregation
│   ├── risk/                   # Risk management agent
│   ├── portfolio/              # Portfolio decision agent
│   ├── memory/                 # Layered memory (FinMem-inspired)
│   │   ├── short_term.py
│   │   ├── medium_term.py
│   │   └── long_term.py
│   ├── llm/                    # LLM provider abstraction
│   │   ├── base.py
│   │   ├── anthropic.py
│   │   ├── openai.py
│   │   ├── gemini.py
│   │   └── factory.py
│   ├── orchestrator.py         # LangGraph pipeline coordinator
│   └── pyproject.toml
│
├── database/                   # Shared across frontend & backend
│   ├── supabase/
│   │   ├── migrations/
│   │   ├── schema.sql
│   │   └── seed.sql
│   └── mongo/
│       ├── schemas/            # JSON schemas for trace documents
│       └── indexes.js
│
├── docs/                       # Architecture, API docs, guides
│   └── ATLAS_CONTEXT.md        # THIS FILE — source of truth
├── scripts/                    # Dev tooling, setup
├── tests/
│   ├── unit/
│   ├── integration/
│   └── backtest/
├── .env.example
└── README.md
```

### Why this structure:

- **`frontend/`** and **`backend/`** are separate deployment targets with separate dependency trees
- **`agents/`** is separate from backend because agents make slow LLM calls (5–30s each) vs API handling fast HTTP requests. In production, agents run as background workers. For capstone, backend imports agents as a local Python package.
- **`broker/`** and **`boundary/`** stay inside backend because they're part of the synchronous execution path
- **`database/`** is top-level because both frontend (Supabase JS client) and backend write to the databases

---

## 8. Capstone Timeline & Deliverables

| Phase | Weeks | Period | Key Activities | Deliverables |
|-------|-------|--------|---------------|-------------|
| Phase 1: System Design | 1–2 | 2 Mar – 15 Mar | Architecture, agent specs, DB schemas, evaluation framework | Architecture diagram, technical design docs, evaluation framework |
| Phase 2: Core Agent Dev | 3–6 | 16 Mar – 12 Apr | Implement agents, historical data integration, reasoning traces, basic dashboard, initial backtesting | Functional multi-agent system, initial backtest results, **INTERIM REPORT (12 April)** |
| Phase 3: Backtesting | 7–9 | 13 Apr – 3 May | Signal logic improvements, position sizing, stop-loss, performance analytics | Performance evaluation module, equity curves, baseline comparison |
| Phase 4: Broker Integration | 10–13 | 4 May – 31 May | Alpaca paper trading, EBC, approval/override interface | Fully integrated pipeline, execution logging |
| Phase 5: UAT | 14–16 | 1 Jun – 21 Jun | Structured testing across boundary modes, quantitative metrics, qualitative feedback | UAT report, behavioral analysis |
| Phase 6: Refinement | 17–18 | 22 Jun – 5 Jul | Bug fixes, performance optimization, reasoning clarity | Stable V1 system |
| Phase 7: Final Evaluation | 19–20 | 6 Jul – 19 Jul | Final benchmarking, analysis, write final report | **FINAL REPORT (19 July)**, demo-ready system |

### Phase 1 Status (as of 13 March 2026):

- Architecture diagram: ✅ DONE (HTML visual created)
- Technical design documentation: 🔄 IN PROGRESS
- Evaluation framework: ❌ NOT STARTED

---

## 9. Phase 2 Build Plan (16 Mar – 12 Apr 2026)

**Goal by 12 April**: A working agent pipeline that can ingest market data, reason through a trade, and execute it in paper trading — with all 3 EBC modes demonstrably functional.

### Week 3 — Mar 16–22: Data Pipeline + Agent Scaffolding

**Priority: Feed the brain before building it.**

- Set up market data ingestion via Alpaca Data API (OHLCV, price, volume)
- MongoDB: define memory schemas (short-term trade context, long-term asset memory)
- Scaffold all 5 agent nodes in LangGraph: `TechnicalAnalyst`, `FundamentalAnalyst`, `SentimentAnalyst`, `Synthesis`, `RiskAgent` — even as stubs
- LLM factory pattern wired up: quick-think models for analysts, deep-think for synthesis and risk
- **End state**: Data flows in. Agents exist. Graph runs end-to-end. Nothing smart yet.

### Week 4 — Mar 23–29: Analyst Agents (The Signal Layer)

**Priority: Make each analyst genuinely useful.**

- `TechnicalAnalyst`: RSI, MACD, moving averages, support/resistance levels
- `FundamentalAnalyst`: P/E, revenue trends, earnings surprises (Financial Modeling Prep or Alpha Vantage)
- `SentimentAnalyst`: News via Alpaca News API, basic LLM sentiment scoring
- Each agent outputs structured signal: `{ ticker, direction, confidence, rationale }`
- Reasoning trace logging baked in from day one — academic requirement AND product differentiator
- **End state**: Three analysts running in parallel, producing traceable signals.

### Week 5 — Mar 30–Apr 5: Synthesis → Risk → EBC → Broker

**Priority: Full pipeline fires.**

- `Synthesis`: Bull/bear debate — takes 3 analyst outputs, produces structured thesis with confidence weighting
- `RiskAgent`: Position sizing, max drawdown guard, portfolio concentration check
- `PortfolioDecision`: Final trade recommendation with rationale
- **EBC**: The product's crown jewel
  - `Advisory`: surfaces recommendation + reasoning, no execution
  - `Conditional`: executes only if confidence ≥ threshold AND no override flag
  - `Autonomous`: executes directly, logs everything
- Alpaca paper trading integration: `place_order()`, `get_portfolio()`, `get_positions()`
- **End state**: Full pipeline fires. A trade gets recommended, gated, and placed (on paper). EBC modes switchable.

### Week 6 — Apr 6–12: Integration + Interim Report

**Priority: Stabilise + articulate.**

- Wire up Next.js dashboard: live trade feed, reasoning trace view, mode switcher
- Run a 3–5 day paper trading session to have real data for the report
- Interim report framing: evaluation framework, what's being measured, why it matters, early results
- Academic angle for Prof Xu: configurable human-agent boundary as novel contribution with real-world risk management implications; MAS regulatory context; Singapore retail investor transparency gap
- **End state**: Demo-ready system with real paper trades and logged reasoning traces.

### Phase 2 Risk Register

| Risk | Mitigation |
|------|-----------|
| Time: 40h/week Prudential + building Atlas | EBC cannot slip — it is both the academic novelty and product moat. Build it Week 5 no matter what. |
| Scope creep | No crypto, no multi-asset, no UI polish until Phase 5+. Depth over breadth. |
| Free API rate limits | Alpaca Data API first. Alpha Vantage / FMP as fallback. Cache everything in MongoDB early. |
| LLM latency | Parallel analyst execution via LangGraph. Async throughout. Deep-think models only for synthesis/risk. |

---

## 10. Evaluation Framework

### Quantitative Metrics (across all three boundary modes):

- Return on capital
- Sharpe ratio
- Maximum drawdown
- Trade execution latency
- Override frequency (Conditional and Autonomous modes)
- Reasoning trace completeness score

### Qualitative Metrics (UAT):

- User confidence level in AI recommendations
- Decision regret after trades
- Perceived clarity of AI reasoning
- Trust calibration across modes

### Key Academic Question:

"What is the optimal human-agent execution boundary for retail AI-assisted trading?"

"Optimal" must be defined as a composite scoring framework — not just max Sharpe or min regret, but a weighted combination. This shapes UAT survey design and metric instrumentation.

### Prof Xu's Feedback to Address:

Frame the problem around concrete business/finance domain impact. Recommended angle: the rise of retail trading platforms (moomoo, Tiger Brokers, Syfe Trade) in Singapore and the transparency gap in AI-powered tools available to retail investors. Reference MAS AI governance principles and SGX investor protection framework.

---

## 11. Key Academic References

| Paper | Relevance to Atlas |
|-------|-------------------|
| **TradingAgents** (arxiv 2412.20138, Tauric Research) | Multi-agent architecture with specialised roles. Atlas borrows the analyst-researcher-trader pipeline but adds the EBC. |
| **FinMem** (arxiv 2311.13743) | Layered memory architecture (short/medium/long-term). Atlas implements this for swing trading across multiple timeframes. |
| **AI-Trader** (HKUDS, arxiv 2512.10971) | Benchmark framework comparing LLM trading performance. Template for Atlas's cross-mode evaluation. |
| **TradeTrap** (GitHub: Yanlewen/TradeTrap) | Security considerations for AI trading systems. Important for risk discussion in reports. |
| **TwinMarket** (FreedomIntelligence) | Market simulation framework. Potential for synthetic stress-testing scenarios. |
| Multimodal Foundation (arxiv 2402.18485) | Future enhancement — visual chart reading by multimodal LLMs. |

### Open Source References:

- https://github.com/TauricResearch/TradingAgents
- https://github.com/HKUDS/AI-Trader
- https://github.com/astronights/A4-Trading
- https://github.com/EthanAlgoX/LLM-TradeBot
- https://github.com/FreedomIntelligence/TwinMarket
- https://github.com/Yanlewen/TradeTrap

---

## 12. Product Vision (Post-Capstone)

### Positioning Statement

Atlas is not "an AI trading bot." Atlas is **a configurable AI trading system with full reasoning transparency.** That framing matters — it puts Atlas in a category of one, not in a race against 10,000 bots.

### Subscription Model

| Tier | Mode | Price Point | Hook |
|------|------|-------------|------|
| **Free** | Advisory only | $0 | Signals + full reasoning traces. Viral growth mechanism. |
| **Pro** | Conditional | ~$30–50/month | AI proposes, you approve. Training wheels with intelligence. |
| **Premium** | Autonomous | ~$80–120/month | AI executes, you override. Full trust, full transparency. |

### API for Developers

- Full REST API with OpenAPI 3.1 documentation
- Webhook support for real-time event delivery
- Designed for AI agents to discover and integrate via API docs

### Expansion Roadmap

- **V1**: US Equities via Alpaca (paper) → IBKR (real money, Singapore users)
- **V2**: Crypto markets (Binance/Bybit adapter)
- **V3**: Natural language strategy creation (Composer-style NLP layer on top of existing pipeline)
- **V4**: Multi-broker support — subscribers bring their own broker

---

## 13. Scope Boundaries

### In Scope (Capstone):

- Multi-agent trading decision pipeline (5 agents via LangGraph)
- Configurable Execution Boundary Controller (Advisory / Conditional / Autonomous)
- Historical backtesting engine
- Paper trading integration with Alpaca
- Reasoning trace logging and auditability layer (MongoDB)
- Structured User Acceptance Testing (UAT)
- Comparative evaluation across boundary modes
- Next.js dashboard (live trade feed, reasoning trace view, mode switcher)

### Out of Scope (Capstone, but designed for in architecture):

- Multi-broker benchmarking
- Public SaaS deployment
- Payment or subscription systems
- Multi-user infrastructure (but `user_id` exists from day one)
- Real capital deployment
- Crypto markets
- UI polish beyond functional demonstration

---

## 14. Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 2026 | Alpaca as primary data + paper trading broker | Free tier, clean API, news data included, resets anytime |
| Mar 2026 | MongoDB for reasoning traces, Supabase for structured data | Traces are deeply nested + variable structure; relational data needs ACID guarantees |
| Mar 2026 | LangGraph for agent orchestration | Native support for parallel node execution (analyst team runs concurrently) |
| Mar 2026 | EBC as Week 5 Phase 2 priority — cannot slip | Academic novelty + product moat in one. Everything else can be simplified if time is short. |
| Mar 2026 | "Product Atlas" not "Project Atlas" | A project ends. A product compounds. All decisions reflect commercial intent from day one. |
| Mar 2026 | US Equities only for V1, not crypto | Entire OpenClaw/bot ecosystem is crypto-native. US equities + swing trading = uncontested lane. |

---

*Last updated: 13 March 2026*
*Maintained by: Lin Zhenming (Edmund)*
*Next update: After Phase 2 Week 3 completion (22 March 2026)*
