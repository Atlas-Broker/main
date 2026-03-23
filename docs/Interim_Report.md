# Atlas: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

**BAC3004 Capstone Project — Interim Report**

Singapore Institute of Technology
Information and Communications Technology Cluster

**Candidate:** Lin Zhenming (2302993)
**Programme:** Applied Computing (Fintech)
**Organization:** Prudential Assurance Company Singapore
**Project Period:** January 2026 to August 2026
**Reporting Period:** February 2026 to April 2026

**Academic Supervisor:** Xu Bing Jie (bingjie.xu@singaporetech.edu.sg)
**Industry Supervisor:** Chin Wei Shan (wei.shan.chin@prudential.com.sg), AI Engineer, Prudential Singapore

---

## Abstract

<!-- ~150 words -->

Retail investors in Singapore operate in an increasingly data-rich environment yet remain underserved by AI trading tools that either function as opaque black boxes or offer only rudimentary rule-based automation. This report presents Atlas, a multi-agent AI trading system built around a novel Execution Boundary Controller (EBC) that makes the division of execution authority between human and AI explicitly configurable. Three EBC modes are implemented: Advisory, Conditional, and Autonomous. The system's agent pipeline runs parallel specialised analysts — Technical, Fundamental, and Sentiment — whose outputs are synthesised through a structured debate before a Risk agent applies position sizing rules and a Portfolio Decision agent issues a final signal. A backtesting engine replays the real LLM pipeline on historical data to generate quantitative performance metrics. The research question guiding this work is: how should the boundary of execution authority between human and AI be configured in a retail trading assistant to optimise for both performance and user trust? This interim report covers design, implementation, evaluation framework, and early findings to date.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Literature Review](#2-literature-review)
3. [System Design](#3-system-design)
4. [Implementation](#4-implementation)
5. [Technical Challenges](#5-technical-challenges)
6. [Evaluation Framework](#6-evaluation-framework)
7. [Early Results](#7-early-results)
8. [Knowledge Applied](#8-knowledge-applied)
9. [Remaining Work](#9-remaining-work)
10. [References](#references)

---

## 1. Introduction

### 1.1 The Singapore Retail Trading Landscape

Retail participation in financial markets has grown substantially in Singapore over the past decade. The COVID-19 period accelerated this trend, as retail brokerage account openings reached record levels across platforms such as Moomoo, Tiger Brokers, and POEMS. This demographic of self-directed investors — often employed full-time with limited hours available for market research — is increasingly receptive to AI-assisted decision support. Yet the tools currently available to them fall into one of two unsatisfying categories: either fully manual platforms with no AI reasoning layer, or algorithmically driven systems that remove the human entirely from the decision loop with no explanation of why a trade was made.

The Monetary Authority of Singapore (MAS) has been attentive to the risks that AI-driven financial systems introduce. MAS guidelines on AI and data analytics (ADA) in financial services emphasise fairness, accountability, and explainability. The ADA principles specifically call for AI systems used in financial services to be transparent in their decision logic, auditable in their outputs, and appropriately supervised by human actors. Regulatory posture in Singapore therefore actively disfavours black-box AI trading systems and creates a governance environment that rewards designs with human-in-the-loop mechanisms.

### 1.2 The Gap in Existing Platforms

Commercial AI trading tools fall into two failure modes. Black-box systems such as Trade Ideas' Holly AI (USD 178–254/mo) surface trading signals without exposing the underlying reasoning, making it impossible for the user to calibrate trust or identify systematic errors. Rule-based automation platforms such as 3Commas and Composer (USD 32/mo) allow users to define condition-based strategies but do not perform genuine AI reasoning over multi-modal financial data — they translate human-defined rules into automated execution rather than independently analysing market conditions. Broker ecosystems compound this problem: Alpaca's own showcase of AI trading bots features thin Zapier-to-ChatGPT wrappers with no reasoning or risk guardrails, while the most "advanced" Interactive Brokers automation setup (AdvancedAutoTrades) requires users to pay three separate subscriptions — signal provider, execution middleware, and brokerage — for a single automated workflow with zero transparency.

No existing retail platform offers the combination of: (1) a multi-agent reasoning pipeline whose intermediate steps are fully visible to the user; and (2) configurable execution authority, whereby the user decides how much independent action the AI is permitted to take. This combination — reasoning transparency paired with configurable execution authority — is Atlas's primary differentiator.

### 1.3 Research Question

> **How should the boundary of execution authority between human and AI be configured in a retail trading assistant to optimise for both performance and user trust?**

The Execution Boundary Controller (EBC) is Atlas's direct answer to this question. Rather than fixing the human-AI authority boundary at design time, the EBC makes it a runtime configuration parameter, allowing the research to compare outcomes across boundary configurations using both quantitative backtesting data and qualitative user acceptance testing.

---

## 2. Literature Review

### 2.1 Multi-Agent AI Trading Pipelines

**TradingAgents** (Xiao et al., 2024, arXiv:2412.20138) provides the closest architectural precedent for Atlas. The paper proposes a multi-agent LLM framework in which specialised agents — analysts, researchers, and a trading manager — operate in a coordinated pipeline to generate trading decisions. The key insight is that dividing analytical labour across specialised agents produces better-calibrated signals than a single monolithic LLM. Atlas adopts this pipeline philosophy and extends it with the Execution Boundary Controller that governs whether and how signals are executed.

**FinMem** (Yu et al., 2023, arXiv:2311.13743) addresses the memory architecture problem in LLM-based trading agents, proposing a layered memory system comprising working memory, short-term memory, and long-term memory. Atlas implements a version of this principle through MongoDB reasoning traces: every pipeline run persists the full structured output of each agent, creating an auditable long-term record that can be used for pattern analysis and, in future iterations, as retrieval context for subsequent pipeline runs.

**AI-Trader** (HKUDS, 2024, arXiv:2512.10971) provides a benchmark methodology for evaluating LLM-based trading agents. The paper establishes evaluation conventions — cumulative return, Sharpe ratio, maximum drawdown — that Atlas adopts directly in its backtesting metrics. AI-Trader's findings on the importance of data recency constraints are particularly relevant to Atlas's `as_of_date` constraint in the backtesting engine.

### 2.2 Open-Source AI Trading Frameworks

**StockClaw** (24mlight) is the open-source project most directly comparable to Atlas's backtesting approach. StockClaw replays an LLM pipeline over frozen historical datasets with strict T-1 data constraints. Atlas independently arrived at the same core constraint through an `as_of_date` parameter. Key differences: Atlas replays the real Gemini pipeline (rather than a rule-based simulation), exposes backtesting through a web UI with equity curve visualisation, manages jobs asynchronously with per-user isolation, and persists full daily run results to MongoDB. A known limitation relative to StockClaw is that Atlas does not yet enforce date constraints on news and sentiment data — addressed in Section 9.

**AlphaClaw** (熵简科技) introduces the concept of Philosophy Skills, in which LLM trading agents are configured with named investment philosophies — value investing, growth investing, macro analysis — as explicit reasoning frameworks. Atlas adopts this idea as a planned third experimental axis: naming analyst agents with investment philosophy frameworks (Value Investor, Momentum Trader, Macro Strategist) so that the Synthesis agent reconciles philosophical disagreement rather than merely aggregating data streams.

### 2.3 Commercial AI Trading Platforms

<!-- TODO: Add 1-2 sentences on StockHero ($30-100/mo, 100K+ users, Alpaca-integrated, no reasoning transparency) as the closest commercial competitor in the US equities bot space. -->

Trade Ideas / Holly AI serves as the primary commercial benchmark. At USD 178–254 per month, it generates intraday signals from pattern-matching with no reasoning exposed. Composer (USD 32/mo) translates natural language strategy descriptions into rules but does not reason independently. 3Commas provides rule-based crypto automation. None addresses configurable execution authority. Notably, even the broker ecosystem itself validates this gap: Alpaca's own article showcasing AI trading bots (April 2025) presents four examples that are all thin wrappers with no multi-agent reasoning, no risk management, and no backtesting capability.

### 2.4 Human-AI Teaming Theory

The EBC draws on two foundational frameworks. **Endsley's situational awareness model** (1995) decomposes human operational effectiveness into perception, comprehension, and projection. A system that surfaces full reasoning traces directly supports all three stages. The EBC's Advisory mode is optimised for situational awareness — the human retains execution authority and the AI enhances the information environment.

**Parasuraman's levels of automation** (2000) define automation across a spectrum from full human control to full machine control, arguing that intermediate levels often produce better outcomes in high-stakes environments. The three EBC modes map directly onto this spectrum, making Atlas a practical implementation of Parasuraman's theoretical framework in a financial domain context.

---

## 3. System Design

### 3.1 Architecture Overview

Atlas is a cloud-native web application with three independently deployed service layers: a Next.js 16 frontend (Vercel), a FastAPI backend (Render), and a dual-database layer (Supabase PostgreSQL + MongoDB Atlas). Authentication is handled end-to-end by Clerk. The backend validates every request against Clerk's JWKS endpoint and extracts the Clerk user ID as the authoritative identity. All API routes are versioned under `/v1/`.

<!-- TODO: Insert architecture diagram (docs/diagrams/atlas-system-architecture.png) -->

### 3.2 Agent Pipeline

The agent pipeline is implemented using LangGraph's directed acyclic graph execution model with a fan-out / fan-in topology and a sequential tail:

```
Market Data (yfinance: 90-day OHLCV, fundamentals, news)
         │
         ├───────────────────┬──────────────────┐
         ▼                   ▼                   ▼
[Technical Analyst]  [Fundamental Analyst]  [Sentiment Analyst]
 RSI, SMA, volume,    P/E, EPS growth,      News headline scoring,
 Bollinger Bands       debt/equity, moat      theme extraction
         │                   │                   │
         └───────────────────┴──────────────────┘
                             │
                             ▼
                   [Synthesis Agent]
                Bull/bear debate, weighs
                agreement and contradiction
                             │
                             ▼
                    [Risk Agent]
                2% portfolio risk rule,
                2:1 reward-to-risk ratio,
                position sizing
                             │
                             ▼
               [Portfolio Decision Agent]
               BUY / HOLD / SELL + confidence (0–100)
               Full reasoning trace → MongoDB
                             │
                             ▼
          Execution Boundary Controller (EBC)
                             │
                             ▼
                   Broker (Alpaca paper)
```

All three analyst agents execute in parallel via LangGraph's fan-out mechanism. All LLM calls use Gemini 2.5 Flash with structured JSON output (`response_mime_type="application/json"`). Latency is tracked per node and stored in the reasoning trace. A factory pattern in `agents/llm/factory.py` ensures no LLM is called directly outside the factory.

### 3.3 Execution Boundary Controller

The EBC sits between the Portfolio Decision Agent and the broker adapter. Its behaviour is governed by the user's configured mode, persisted in the `profiles.boundary_mode` column. Two modes are implemented and deployed:

| Mode | Behaviour | Threshold | Override Window |
|------|-----------|-----------|-----------------|
| **Advisory** | AI generates signals. All signals queue for human review. No automated execution. | N/A | N/A |
| **Autonomous** | AI executes automatically when confidence exceeds threshold. Human retains a post-execution override window to cancel the order, logged to the `override_log` audit table. | ≥ 65% confidence | 5 minutes |

The trading logic is identical across both modes. Only the execution authority changes.

### 3.4 Backtesting Engine

The backtesting engine replays the real Gemini pipeline over historical date ranges rather than substituting a rule-based simulation. This ensures backtest results directly measure AI decision quality.

Key design decisions: `as_of_date` parameter constrains yfinance OHLCV and fundamental data to the simulated date (no look-ahead bias); virtual portfolio starts at $10,000 with $1,000 notional per trade; execution price uses next trading day's open; EBC thresholds mirror live configuration; Advisory mode produces signals only (total_trades always 0) for a clean signal quality baseline; async job management with max 1 running job per user and max 90-day range.

> **Known limitation:** The yfinance news endpoint returns current headlines regardless of `as_of_date`, introducing potential look-ahead bias in sentiment signals. Resolution via Alpaca News API's date-range parameters is planned pre-final-report (see Section 9).

### 3.5 Database Architecture

**Supabase PostgreSQL** handles structured relational data with Row-Level Security (RLS) on all six tables: `profiles`, `portfolios`, `positions`, `trades`, `override_log`, `backtest_jobs`. RLS policies use `auth.jwt() ->> 'sub'` to match Clerk user IDs. Schema managed via three migrations in `database/supabase/migrations/`.

**MongoDB Atlas** handles document-structured data: `reasoning_traces` (one document per pipeline run, full structured output of every agent) and `backtest_results` (one document per job, daily run arrays, equity curve, aggregate metrics). The document model accommodates the variable-depth, deeply nested nature of reasoning traces without requiring schema migrations as the pipeline evolves.

---

## 4. Implementation

### 4.1 Build Progress

The system is ahead of the original project timeline. Broker integration (originally Phase 4) and backtesting (Phase 3) were both completed within Phase 2. A pricing page was added in Phase 2. As of the reporting date:

- **12 API endpoints live** — health check, pipeline execution, signal management (approve/reject), portfolio data, trade history, override handling, and full backtesting CRUD. No stubs remain.
- **Authentication integrated end-to-end** — Clerk JWT verification on every route, AuthSync component syncs Clerk users to Supabase on sign-in.
- **5-tab dashboard** — Overview, Signals (with approve/reject), Positions, Backtest (job management + equity curve), Settings (mode persistence).
- **Backtesting engine shipped** — async runner, real Gemini pipeline replay, virtual portfolio, metrics computation (Sharpe, drawdown, win rate).
- **Pricing page deployed** — Server component with Free/Pro/Max tiers, annual/monthly toggle, feature comparison table. Free tier limited to Advisory mode; Pro/Max unlock Autonomous trading.

### 4.2 Pipeline Execution Flow

A user initiates a pipeline run from the dashboard or admin page (or via scheduled cron). The backend creates a LangGraph execution graph, passes market data fetchers the current date (or `as_of_date` in backtest context), runs three analyst agents in parallel, and sequences through Synthesis, Risk, and Portfolio Decision. The complete reasoning trace is persisted to MongoDB before the EBC is invoked — ensuring every signal has a full audit record regardless of execution outcome. The signal surfaces on the dashboard as a card showing ticker, direction, confidence, risk parameters, and an expandable per-agent reasoning breakdown.

### 4.3 Backtesting Flow

The user submits a job specifying tickers, date range (max 90 days), and EBC mode. The backend validates the request, creates a `backtest_jobs` record in Supabase, and launches the runner as an async background task. The runner iterates day-by-day, invoking the full Gemini pipeline per ticker per trading day with `as_of_date` set to the simulated date. Executed trades update the virtual portfolio. On completion, computed metrics and the full daily runs array are written to MongoDB; the Supabase job record status updates to `completed`. The frontend polls and renders the equity curve and metrics when ready.

### 4.4 Scheduled Pipeline Runs

The backend includes a configurable scheduler (APScheduler) that runs the pipeline daily at US market open (9:30 AM ET / 9:30 PM SGT) for a configurable watchlist of tickers. This transforms Atlas from a manually triggered tool into a system that generates signals proactively. Configuration is via environment variables: `SCHEDULER_ENABLED`, `SCHEDULER_TICKERS`, `SCHEDULER_EBC_MODE`, and `SCHEDULER_USER_ID`.

### 4.5 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Gemini 2.5 Flash** | Cost-effective for high-frequency structured JSON calls. Supports output schema enforcement. |
| **LangGraph** | Native parallel node execution (fan-out/fan-in), explicit state management, conditional edge routing for EBC logic. |
| **MongoDB for traces** | Reasoning traces are deeply nested and variable in structure. Relational schema would require constant migration. |
| **Supabase for structured data** | ACID guarantees and RLS on financial tables (trades, portfolios, override log) are non-negotiable. |
| **Alpaca Paper Trading** | Fully functional broker API with real market data against a paper portfolio — no real money at risk during evaluation. |
| **API-first architecture** | Dashboard is one client among many. Enables future mobile app, developer API, and programmatic supervisor access. |
| **Real LLM replay in backtesting** | A rule-based simulation tests the rules, not the AI. Real Gemini replay measures actual AI decision quality. |

---

## 5. Technical Challenges

### 5.1 Parallel Agent Execution

LangGraph's fan-out mechanism requires careful state management. The three analyst agents write to different keys of a shared state dictionary. A custom `Annotated` dict reducer merges parallel outputs into a single state object for the Synthesis agent. Debugging parallel execution failures required trace-level logging to identify which agent produced malformed output.

### 5.2 Auth Integration Across Three Systems

Clerk, Supabase, and the FastAPI backend each have different JWT expectations. The solution: Clerk issues JWTs with a custom `atlas-supabase` template (HS256-signed with Supabase's JWT secret, `aud: "authenticated"`). The backend verifies against Clerk's JWKS endpoint and extracts `sub` as user ID. Supabase RLS policies use `auth.jwt() ->> 'sub'` to match Clerk user IDs — not Supabase's native `auth.uid()`. This three-way integration required a frontend `AuthSync` component that upserts profiles on every sign-in.

### 5.3 Idempotent Trade Execution

The signal approval endpoint must be idempotent — approving the same signal twice should not place two broker orders. The solution checks the MongoDB trace's `execution.executed` flag before calling the broker. If already executed, the endpoint returns the existing order ID rather than placing a duplicate.

### 5.4 Backtesting Look-Ahead Bias

Preventing the AI from "seeing the future" in backtests required threading an `as_of_date` parameter through every data fetcher. Price and fundamental data are truncated to the simulated date. However, yfinance's news endpoint ignores date parameters entirely, returning current headlines. This is documented as a known limitation (Section 3.4) with a planned fix via Alpaca News API's date-range support.

### 5.5 Supabase Client Quirks

The `supabase-py` v2 library's `maybe_single()` method returns `None` (not a response object with empty data) when no row matches. This caused `AttributeError: 'NoneType' object has no attribute 'data'` crashes on profile lookups for new users. Fixed with defensive null checking: `if result and result.data:` instead of `if result.data:`.

### 5.6 Render Free-Tier Sleep

Render's free tier puts services to sleep after inactivity. A keep-alive background task in FastAPI pings the service's own health endpoint periodically using `RENDER_EXTERNAL_URL` (auto-injected by Render) to prevent cold starts during market hours.

---

## 6. Evaluation Framework

### 6.1 Quantitative Metrics (Backtesting)

| Metric | Description |
|--------|-------------|
| **Cumulative Return** | Total portfolio return over the backtest period as a percentage of starting capital. |
| **Sharpe Ratio** (annualised) | Excess return per unit of volatility. Risk-free rate: 0% (conservative). |
| **Maximum Drawdown** | Largest peak-to-trough decline in portfolio value. Measures downside risk. |
| **Win Rate** | Proportion of closed trades with positive return. Open positions excluded. |
| **Signal-to-Execution Rate** | Proportion of signals that resulted in trades. Advisory mode: always 0%. Autonomous: approaches 100%. Captures how much AI output is acted upon. |
| **Per-Ticker Contribution** | Return contribution by individual ticker — identifies concentration risk. |

### 6.2 Qualitative Metrics (User Acceptance Testing — Phase 5)

UAT will be conducted with supervisors and recruited retail investor test users, measuring: user confidence in decisions per EBC mode, decision regret (executed and missed trades), reasoning clarity (comprehensibility of agent traces), mode preference after experiencing all three modes, and override satisfaction (whether the 5-minute window provides adequate time and information).

### 6.3 Composite "Optimal Boundary" Score

**OBS = α · Sharpe(mode) + β · (1 − |MaxDrawdown(mode)|) + γ · TrustScore(mode) + δ · ExecutionEfficiency(mode)**

Where α, β, γ, δ are weighting coefficients determined empirically from UAT feedback. Execution efficiency captures signal-to-execution rate weighted by trade latency.

### 6.4 Three Experimental Axes

**Axis 1 — EBC Mode** (primary): Advisory vs. Autonomous. Central research axis. Hypothesis: a carefully designed autonomous mode with an override window achieves comparable performance to advisory mode while reducing friction.

**Axis 2 — Orchestration Architecture**: v2 parallel fan-out (current) vs. v3 Adaptive Conductor (planned). The v3 conductor selectively spawns analysts based on market context, reducing latency and improving signal quality when data quality is uneven.

**Axis 3 — Philosophy Skills** (AlphaClaw-inspired): Value Investor / Momentum Trader / Macro Strategist / Balanced. Hypothesis: no single philosophy dominates all market conditions.

---

## 7. Early Results

<!-- TODO: Replace this section with actual data once backtest jobs complete.
     Target: 5 tickers (AAPL, MSFT, TSLA, NVDA, META) × 3 EBC modes × 60-day window = 15 jobs.
     Include: equity curves, Sharpe ratios, drawdown charts, signal frequency comparison.
     Screenshots: backtest tab, signal cards, reasoning trace expansion. -->

### 7.1 Backtesting Status

As of the reporting date, the backtesting engine is fully operational and initial batches are in progress. The target batch covers five tickers — AAPL, MSFT, TSLA, NVDA, and META — across a 60-day historical window in all three EBC modes. Backtesting at this scale involves real Gemini API calls for every pipeline run on every trading day, introducing both cost and latency. The async job management system handles this well — jobs run in the background and results are available when ready.

### 7.2 Advisory Mode as Baseline

Advisory mode backtests establish a signal quality baseline. In Advisory mode, all signals are recorded but no trades are executed (`total_trades = 0`). This produces a clean dataset of AI-generated signals against known subsequent price movements, allowing measurement of directional accuracy independent of position sizing or execution timing effects. Both backtest and live pipeline operations track this metric as a key component of AI decision quality evaluation.

### 7.3 Live Pipeline Operation

The live agent pipeline has been operating in paper trading mode via the scheduled daily runs, accumulating pipeline decisions with approve/reject history. This data provides concrete examples of signal quality, reasoning trace clarity, and execution outcomes for the qualitative evaluation phase.

<!-- TODO: Add table of sample pipeline runs showing ticker, date, action, confidence, outcome.
     Add screenshot of a reasoning trace expansion showing all 3 analyst outputs + synthesis debate. -->

---

## 8. Knowledge Applied

### 8.1 Classroom Knowledge

- **Programming Fundamentals / Software Engineering**: Python backend (FastAPI, LangGraph agents), TypeScript frontend (Next.js 16), modular architecture with separation of concerns, API-first design pattern.
- **Database Systems**: Dual-database architecture — PostgreSQL (Supabase) for ACID-compliant relational data with Row-Level Security, MongoDB Atlas for variable-structure document storage. Schema design, migration management, indexing strategy.
- **Web Application Development**: Full-stack web application with REST API design, JWT authentication, CORS configuration, responsive UI with Tailwind CSS.
- **Fintech Domain Knowledge**: Trade lifecycles, order types, risk management principles (position sizing, stop-loss, take-profit), portfolio metrics (Sharpe ratio, maximum drawdown, win rate), broker API integration.

### 8.2 Beyond-Classroom Knowledge

- **Multi-agent system design**: LangGraph directed acyclic graph execution, parallel fan-out/fan-in patterns, state management across agent nodes — not covered in any coursework module.
- **LLM structured output**: Gemini's `response_mime_type` for schema-enforced JSON responses, prompt engineering for financial reasoning.
- **Human-AI interaction models**: Parasuraman's levels of automation, Endsley's situational awareness — applied to design the configurable execution boundary.
- **Explainable AI**: Full reasoning trace persistence, per-agent audit trails, transparency as a product feature.
- **Cloud-native deployment**: Docker containerisation, Vercel/Render deployment, environment-based configuration, keep-alive strategies for free-tier infrastructure.
- **Auth architecture**: Clerk JWT issuance, JWKS verification, custom JWT templates for cross-service auth (Clerk → Supabase RLS).

---

## 9. Remaining Work

**Sentiment Look-Ahead Bias Fix**: Replace yfinance news fallback with Alpaca News API's `start`/`end` date parameters to close the remaining look-ahead bias gap in backtesting.

**v3 Adaptive Conductor**: A meta-agent that selectively spawns analyst agents based on market context (e.g., suppressing Fundamental for highly liquid tickers where price action dominates). Expected to reduce latency and improve signal quality.

**Philosophy Skills Implementation**: Apply named investment philosophy overlays (Value/Momentum/Macro/Balanced) at the analyst prompt level. Creates the third experimental axis.

**Circuit Breaker for Autonomous Mode**: Pause auto-execution on consecutive losses or high drawdown. Notification via Telegram or email on trigger.

**Pricing Tier Integration**: Wire pricing page to Stripe/billing backend. Enforce Free tier limits (5-ticker max, Advisory mode only) at API level. Pro/Max unlock Autonomous mode and unlimited tickers.

**OAuth Broker Connect**: One-click authentication flow for Interactive Brokers. Replaces manual API key entry with OAuth login.

**Scheduler Production Hardening**: Extend scheduler to support multi-user cron runs (user per job, not single SCHEDULER_USER_ID). Integrate with pricing tiers.

**User Acceptance Testing (Phase 5)**: UAT with supervisors and recruited retail investors. Results feed into the qualitative dimension of the composite Optimal Boundary Score.

**IBKR Production Adapter**: The `BrokerAdapter` protocol is designed for swappable implementations. The Interactive Brokers Client Portal API (REST) adapter will replace Alpaca for live trading post-capstone.

**Full Cross-Mode Statistical Analysis**: Complete all backtest batches and conduct rigorous cross-mode, cross-ticker, cross-philosophy comparison for the final report.

---

## References

Endsley, M. R. (1995). Toward a theory of situation awareness in dynamic systems. *Human Factors*, 37(1), 32–64.

Monetary Authority of Singapore. (2021). *Principles to Promote Fairness, Ethics, Accountability and Transparency (FEAT) in the Use of Artificial Intelligence and Data Analytics in Singapore's Financial Sector*. MAS.

Parasuraman, R., Sheridan, T. B., & Wickens, C. D. (2000). A model for types and levels of human interaction with automation. *IEEE Transactions on Systems, Man, and Cybernetics — Part A*, 30(3), 286–297.

Xiao, Y., Li, E., Liu, M., Zheng, Y., Zheng, Z., Liu, P., Roth, D., & Han, J. (2024). TradingAgents: Multi-agents LLM financial trading framework. arXiv:2412.20138.

Yu, S., Li, H., Chen, P., Yao, M., Li, J., Zhou, Z., Cao, Y., & Yan, R. (2023). FinMem: A performance-enhanced LLM trading agent with layered memory and character design. arXiv:2311.13743.

Zhang, J., et al. (2024). AI-Trader: An LLM-based framework for automated financial trading. HKUDS. arXiv:2512.10971.

熵简科技 (AlphaClaw). (2024). *AlphaClaw: Philosophy-driven multi-agent trading framework*. https://alphaengine.top

24mlight (StockClaw). (2024). *StockClaw: Root-agent framework for AI-assisted equity trading with frozen-dataset backtesting*. https://github.com/24mlight/StockClaw

Alpaca Markets. (2025). How traders are using AI agents to create trading bots with Alpaca. https://alpaca.markets/learn

QuantInsti. (2025). How to make a trading bot with Interactive Brokers using Python and ChatGPT. https://quantinsti.com

AdvancedAutoTrades. (2026). Automated trading with Interactive Brokers: Complete guide. https://advancedautotrades.com

IOSCO. (2025). *Artificial Intelligence in Financial Markets*. CR/01/2025.

<!-- TODO: Add MAS TRM reference with full citation details. -->
<!-- TODO: Add StockBrokers.com 2026 AI bot review if cited in body. -->
<!-- TODO: Verify all arxiv IDs and URLs before final submission. -->

---

## Appendices

<!-- Optional subsidiary content — does not count toward word limit. -->

<!-- TODO: Appendix A — Full reasoning trace JSON example (one complete pipeline run) -->
<!-- TODO: Appendix B — Supabase schema (all 6 tables with column definitions) -->
<!-- TODO: Appendix C — MongoDB reasoning_trace schema (from database/mongo/schemas/reasoning_trace.json) -->
<!-- TODO: Appendix D — API endpoint reference (all 11 routes with request/response examples) -->
<!-- TODO: Appendix E — Backtest equity curves and per-ticker breakdown tables -->
<!-- TODO: Appendix F — Architecture diagram, pipeline flow diagram, database schema diagram -->

---

*Estimated word count: ~3,100 words (excluding appendices, tables, diagrams, code blocks)*
*Document status: Semi-completed draft — TODO markers indicate sections requiring data or screenshots.*
*Maintained by: Lin Zhenming (Edmund)*
