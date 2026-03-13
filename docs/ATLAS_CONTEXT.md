# Project Atlas — Full Context Briefing

> This document captures the complete context of Project Atlas as discussed between Lin Zhenming (Edmund) and Claude (chat interface) in March 2026. Use this as the source of truth for all development work.

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
- **Academic Supervisor**: Xu Bing Jie (bingjie.xu@singaporetech.edu.sg) — Assistant Professor at SIT. Feedback: technical complexity is appropriate, but needs stronger business/finance domain impact considerations.
- **Industry Supervisor**: Chin Wei Shan (wei.shan.chin@prudential.com.sg) — AI Engineer at Prudential Singapore. Feedback: direction and purpose well thought out.
- **Organization**: Prudential Assurance Company Singapore (Edmund is concurrently an AI Engineering Intern here, 40h/week, Jan-Aug 2026)

---

## 3. Core Concept

Atlas is a **multi-agent AI trading system** with a unique differentiator: the **Execution Boundary Controller** — a configurable mechanism that lets users choose how much authority the AI has over trade execution.

### Three Execution Modes (the experimental variable AND pricing moat):

| Mode | Behavior | Product Tier |
|------|----------|--------------|
| **Advisory** | AI generates recommendations; human executes manually | Free tier |
| **Conditional** | AI proposes trades; execution requires explicit human approval | Mid tier |
| **Autonomous** | AI executes automatically; human has override window | Premium tier |

The key insight: the trading logic remains **identical** across all three modes. Only the execution authority changes. This enables controlled comparison for the academic evaluation AND creates natural pricing tiers for the product.

---

## 4. Market & Competitive Positioning

### What exists today (as of March 2026):

- **Signal generators** (Trade Ideas/Holly AI): 70+ strategies, backtested nightly, but zero transparency into reasoning. Black box. $178-254/month.
- **No-code strategy builders** (Composer): Natural language to trading algorithm. AI is a translator, not a thinker. $32/month.
- **Fully automated black boxes** (Cryptohopper, 3Commas, WunderTrading): Set and forget. No reasoning traces, no configurable control, total opacity.
- **Institutional grade** (JPMorgan LOXM, D.E. Shaw): Has explainability and audit trails but inaccessible to retail.

### The gap Atlas fills:

No retail platform currently offers **configurable control over execution authority** combined with **full reasoning transparency**. The market is split between "here's a signal, you figure it out" and "give us your money, trust the black box."

Atlas is the first retail AI trading assistant that:
- Shows its thinking (structured reasoning traces)
- Lets you control how much authority it has (three modes)
- Learns from swing trading patterns across multiple timeframes
- Is accessible via API for developers AND GUI for retail users

### Key industry trends supporting this:
- EU pushing Explainable AI (XAI) requirements for financial systems
- Growing regulatory demands for auditable AI decision-making
- Black box problem remains the #1 concern in retail AI trading
- 89% of global trading volume is AI-driven, but retail tools lag far behind institutional in transparency

---

## 5. Technical Decisions

### Market & Trading
- **Target market**: US Equities (primary). Crypto as V2 expansion.
- **Trading style**: Swing trading, multi-timeframe (days to weeks). Not day trading.
- **Broker (dev/paper)**: Alpaca — clean REST API, free paper trading, good historical data
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
| Market Data | Alpha Vantage / Finnhub / broker-provided | Historical OHLCV, real-time quotes, news feeds, social sentiment |

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
Market Data (OHLCV + News + Sentiment feeds)
    ↓
Analysis Team (runs concurrently)
  ├── Technical Analyst Agent — price action, indicators, chart patterns
  ├── Fundamental Analyst Agent — financials, earnings, valuations
  └── Sentiment Analyst Agent — news, social media, market mood
    ↓
Synthesis Agent — aggregates reports, runs bull/bear debate, produces unified trade thesis
    ↓
Risk Management Agent — position sizing, stop-loss, exposure limits, portfolio correlation
    ↓
Portfolio Decision Agent — final BUY/SELL/HOLD with structured reasoning trace
    ↓
Execution Boundary Controller — routes based on mode (Advisory/Conditional/Autonomous)
    ↓
Broker Adapter (Alpaca for paper, IBKR for production)
```

### Memory Architecture (inspired by FinMem, arxiv 2311.13743):

Layered memory system stored in MongoDB Atlas:
- **Short-term memory**: Intraday signals, recent price movements, current positions
- **Medium-term memory**: Weekly patterns, sector rotation, recent trade outcomes
- **Long-term memory**: Market regime knowledge, historical strategy performance, learned preferences

### LLM Strategy (inspired by TradingAgents):
- **Quick-think models** (e.g., Claude Haiku, GPT-4o-mini): Data retrieval, initial scanning, simple classification
- **Deep-think models** (e.g., Claude Opus, GPT-4): Complex analysis, debate synthesis, final trade decisions
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
│   │   ├── technical.py
│   │   ├── fundamental.py
│   │   └── sentiment.py
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
- **`agents/`** is separate from backend because agents make slow LLM calls (5-30s each) vs API handling fast HTTP requests. In production, agents run as background workers. For capstone, backend imports agents as a local Python package.
- **`broker/`** and **`boundary/`** stay inside backend because they're part of the synchronous execution path
- **`database/`** is top-level because both frontend (Supabase JS client) and backend write to the databases

---

## 8. Capstone Timeline & Deliverables

| Phase | Weeks | Period | Key Activities | Deliverables |
|-------|-------|--------|---------------|-------------|
| Phase 1: System Design | 1-2 | 2 Mar – 15 Mar | Architecture, agent specs, DB schemas, evaluation framework | Architecture diagram, technical design docs, evaluation framework |
| Phase 2: Core Agent Dev | 3-6 | 16 Mar – 12 Apr | Implement agents, historical data integration, reasoning traces, basic dashboard, initial backtesting | Functional multi-agent system, initial backtest results, **INTERIM REPORT (12 April)** |
| Phase 3: Backtesting | 7-9 | 13 Apr – 3 May | Signal logic improvements, position sizing, stop-loss, performance analytics | Performance evaluation module, equity curves, baseline comparison |
| Phase 4: Broker Integration | 10-13 | 4 May – 31 May | Alpaca paper trading, execution boundary controller, approval/override interface | Fully integrated pipeline, execution logging |
| Phase 5: UAT | 14-16 | 1 Jun – 21 Jun | Structured testing across boundary modes, quantitative metrics, qualitative feedback | UAT report, behavioral analysis |
| Phase 6: Refinement | 17-18 | 22 Jun – 5 Jul | Bug fixes, performance optimization, reasoning clarity | Stable V1 system |
| Phase 7: Final Evaluation | 19-20 | 6 Jul – 19 Jul | Final benchmarking, analysis, write final report | **FINAL REPORT (19 July)**, demo-ready system |

### Phase 1 Status (as of 13 March 2026):
- Architecture diagram: ✅ DONE (HTML visual created)
- Technical design documentation: 🔄 IN PROGRESS
- Evaluation framework: ❌ NOT STARTED

---

## 9. Evaluation Framework

### Quantitative Metrics (across all three boundary modes):
- Return on capital
- Sharpe ratio
- Maximum drawdown
- Trade execution latency
- Override frequency

### Qualitative Metrics (UAT):
- User confidence level
- Decision regret
- Perceived clarity of AI reasoning
- Trust in AI-generated recommendations

### Key Academic Question:
"What is the optimal human-agent execution boundary for retail AI-assisted trading?"

Must define "optimal" as a composite scoring framework — not just max Sharpe or min regret, but a weighted combination. This shapes UAT survey design and metric instrumentation.

### Prof Xu's Feedback to Address:
Frame the problem around concrete business/finance domain impact. Recommended angle: the rise of retail trading platforms (moomoo, Tiger Brokers, Syfe Trade) in Singapore and the transparency gap in AI-powered tools available to retail investors. Consider MAS regulations and SGX investor protection.

---

## 10. Key Academic References

| Paper | Relevance to Atlas |
|-------|-------------------|
| **TradingAgents** (arxiv 2412.20138, Tauric Research) | Multi-agent architecture with specialized roles. Atlas borrows the analyst-researcher-trader pipeline but adds the Execution Boundary Controller. |
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

## 11. Product Vision (Post-Capstone)

### Subscription Model:
- **Free tier**: Advisory mode only (signals, no execution)
- **Mid tier**: Conditional mode (AI proposes, you approve)
- **Premium tier**: Autonomous mode (AI executes, you override)

### API for Developers:
- Full REST API with OpenAPI 3.1 documentation
- Webhook support for real-time event delivery
- Designed for AI agents to learn and integrate via API docs

### Expansion Roadmap:
- V1: US Equities via Alpaca (paper) → IBKR (real)
- V2: Crypto markets (Binance/Bybit adapter)
- V3: Natural language strategy creation (Composer-style NLP layer)
- V4: Multi-broker support for subscribers to bring their own broker

---

## 12. Scope Boundaries

### In Scope (Capstone):
- Multi-agent trading decision pipeline
- Configurable execution boundary controller
- Historical backtesting engine
- Paper trading integration with Alpaca
- Reasoning trace logging and auditability layer
- Structured User Acceptance Testing (UAT)
- Comparative evaluation across boundary modes

### Out of Scope (Capstone, but designed for in architecture):
- Multi-broker benchmarking
- Public SaaS deployment
- Payment or subscription systems
- Multi-user infrastructure (but `user_id` exists from day one)
- Real capital deployment
- Crypto markets

---

*Last updated: 13 March 2026*
*Maintained by: Lin Zhenming (Edmund)*