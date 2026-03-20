# Atlas: Human–Agent Boundary Evaluation Framework for AI-Assisted Retail Trading Systems

**BAC3004 Capstone Project — Interim Report**
Singapore Institute of Technology
Student: Lin Zhenming (Edmund)
Academic Supervisor: Xu Bing Jie
Industry Supervisor: Chin Wei Shan (AI Engineer, Prudential)
Date: March 2026

---

## Abstract

<!-- ~150w -->

Retail investors in Singapore operate in an increasingly data-rich environment yet remain underserved by AI trading tools that either function as opaque black boxes or offer only rudimentary rule-based automation. This report presents Atlas, a multi-agent AI trading system built around a novel Execution Boundary Controller (EBC) that makes the division of execution authority between human and AI explicitly configurable. Three EBC modes are implemented: Advisory, Autonomous, and Autonomous with Guardrail. The system's agent pipeline runs parallel specialised analysts — Technical, Fundamental, and Sentiment — whose outputs are synthesised through a structured debate before a Risk agent applies position sizing rules and a Portfolio Decision agent issues a signal. A backtesting engine replays the real LLM pipeline on historical data to generate quantitative performance metrics. The research question guiding this work is: how should the boundary of execution authority between human and AI be configured in a retail trading assistant to optimise for both performance and user trust? This interim report covers design, implementation, evaluation framework, and early findings to date.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Literature Review](#2-literature-review)
3. [System Design](#3-system-design)
4. [Implementation](#4-implementation)
5. [Evaluation Framework](#5-evaluation-framework)
6. [Early Results](#6-early-results)
7. [Remaining Work](#7-remaining-work)
8. [References](#references)

---

## 1. Introduction

<!-- ~400w -->

### 1.1 The Singapore Retail Trading Landscape

Retail participation in financial markets has grown substantially in Singapore over the past decade. The COVID-19 period accelerated this trend, as retail brokerage account openings reached record levels across platforms such as Moomoo, Tiger Brokers, and POEMS. This demographic of self-directed investors — often employed full-time with limited hours available for market research — is increasingly receptive to AI-assisted decision support. Yet the tools currently available to them fall into one of two unsatisfying categories: either fully manual platforms with no AI reasoning layer, or algorithmically driven systems that remove the human entirely from the decision loop with no explanation of why a trade was made.

The Monetary Authority of Singapore (MAS) has been attentive to the risks that AI-driven financial systems introduce. MAS Notice on Technology Risk Management (TRM) and the accompanying guidelines on AI and data analytics (ADA) in financial services emphasise fairness, accountability, and explainability. The ADA principles specifically call for AI systems used in financial services to be transparent in their decision logic, auditable in their outputs, and appropriately supervised by human actors. Regulatory posture in Singapore therefore actively disfavours black-box AI trading systems and creates a governance environment that rewards designs with human-in-the-loop mechanisms.

### 1.2 The Gap in Existing Platforms

Commercial AI trading tools fall into two failure modes. Black-box systems such as Trade Ideas' Holly AI surface trading signals without exposing the underlying reasoning, making it impossible for the user to calibrate trust or identify systematic errors. Rule-based automation platforms such as 3Commas and Composer allow users to define condition-based strategies but do not perform genuine AI reasoning over multi-modal financial data — they translate human-defined rules into automated execution rather than independently analysing market conditions.

No existing retail platform offers the combination of: (1) a multi-agent reasoning pipeline whose intermediate steps are fully visible to the user; and (2) configurable execution authority, whereby the user can decide how much independent action the AI is permitted to take without human approval. This combination — reasoning transparency paired with configurable execution authority — is Atlas's primary differentiator.

### 1.3 Research Question

This project is structured around the following research question:

> **How should the boundary of execution authority between human and AI be configured in a retail trading assistant to optimise for both performance and user trust?**

The Execution Boundary Controller (EBC) is Atlas's direct answer to this question. Rather than fixing the human-AI authority boundary at design time, the EBC makes it a runtime configuration parameter, allowing the research to compare outcomes across boundary configurations using both quantitative backtesting data and qualitative user acceptance testing.

---

## 2. Literature Review

<!-- ~600w -->

### 2.1 Multi-Agent AI Trading Pipelines

**TradingAgents** (Xiao et al., 2024, arXiv:2412.20138) provides the closest architectural precedent for Atlas. The paper proposes a multi-agent LLM framework in which specialised agents — analysts, researchers, and a trading manager — operate in a coordinated pipeline to generate trading decisions. The key insight is that dividing analytical labour across specialised agents produces better-calibrated signals than a single monolithic LLM. Atlas adopts this pipeline philosophy and extends it in two critical directions: the introduction of an Execution Boundary Controller that governs whether and how signals are executed, and a Philosophy Skills layer that applies named investment frameworks as reasoning overlays on top of the analyst agents.

**FinMem** (Yu et al., 2023, arXiv:2311.13743) addresses the memory architecture problem in LLM-based trading agents. The paper proposes a layered memory system comprising working memory (current session context), short-term memory (recent trading history), and long-term memory (distilled patterns), arguing that retrieval-augmented generation over structured memory produces more consistent trading behaviour than stateless LLM calls. Atlas implements a version of this principle through MongoDB reasoning traces: every pipeline run persists the full structured output of each agent, creating an auditable long-term record that can be used for pattern analysis and, in future iterations, as retrieval context for subsequent pipeline runs.

**AI-Trader** (HKUDS, 2024, arXiv:2512.10971) provides a benchmark methodology for evaluating LLM-based trading agents across standardised financial datasets. The paper establishes evaluation conventions — cumulative return, Sharpe ratio, maximum drawdown — that Atlas adopts directly in its backtesting metrics. AI-Trader's findings on the importance of prompt design and data recency constraints are particularly relevant to Atlas's `as_of_date` constraint in the backtesting engine.

### 2.2 Open-Source AI Trading Frameworks

**StockClaw** (24mlight) is the open-source project most directly comparable to Atlas's backtesting approach. StockClaw implements a root-agent that replays an LLM pipeline over frozen historical datasets with T-1 data constraints, enforcing that agents only see information available on the simulated trading date. Atlas independently arrived at the same core constraint through an `as_of_date` parameter that truncates yfinance OHLCV and fundamental data. Key differences: Atlas replays the real Gemini pipeline (rather than a rule-based simulation), exposes the backtesting interface through a web UI with equity curve visualisation, manages jobs asynchronously with per-user isolation, and persists full daily run results to MongoDB for post-hoc analysis. A known limitation relative to StockClaw is that Atlas does not yet enforce date constraints on news and sentiment data — addressed further in Section 3.4.

**AlphaClaw** (熵简科技) introduces the concept of Philosophy Skills, in which LLM trading agents are configured with named investment philosophies — value investing, growth investing, macro analysis — as explicit reasoning frameworks. Atlas adopts and extends this idea with four Philosophy Skills modes: `buffett` (intrinsic value, margin of safety, competitive moat, long-term fundamentals), `soros` (macro reflexivity, sentiment shifts, contrarian positioning at inflection points), `lynch` (growth at reasonable price, identifying trends before institutional recognition, consumer-lens analysis), and `balanced` (no philosophical overlay, pure AI reasoning). These modes constitute a third experimental axis in Atlas's evaluation framework.

### 2.3 Commercial AI Trading Platforms

**Trade Ideas / Holly AI** serves as the primary commercial benchmark for signal quality. At USD 178–254 per month, it targets active day traders and generates intraday signals from pattern-matching across the full US equity universe. Its weakness is opacity: Holly's reasoning is not exposed, signals cannot be explained, and users cannot configure how much authority the AI exercises. **Composer** offers a lower-cost alternative (USD 32/month) that translates natural language strategy descriptions into automated trading rules but does not perform independent AI reasoning over market data. **3Commas** provides rule-based crypto automation with no AI reasoning layer. None of these platforms addresses the configurable execution authority problem.

### 2.4 Human-AI Teaming Theory

The design of the EBC draws on two foundational frameworks from human factors research. **Endsley's situational awareness model** (1995) decomposes human operational effectiveness into perception, comprehension, and projection — the three stages at which a human operator forms an accurate mental model of a dynamic environment. In a trading context, a system that surfaces full reasoning traces directly supports all three stages: the user perceives the signal, comprehends the logic behind it, and can project likely outcomes. The EBC's Advisory mode is optimised for this — the human retains execution authority and the AI's role is purely to enhance situational awareness.

**Parasuraman's levels of automation** (2000) provide a complementary framework. Parasuraman defines automation across a spectrum from full human control to full machine control, arguing that intermediate levels of automation — where both human and machine contribute meaningfully — often produce better outcomes than either extreme, particularly in high-stakes, time-pressured environments. The three EBC modes map directly onto this spectrum, making Atlas a practical implementation of Parasuraman's theoretical framework in a financial domain context.

---

## 3. System Design

<!-- ~700w -->

### 3.1 Architecture Overview

Atlas is a cloud-native web application with three independently deployed service layers.

```
Browser (Next.js 16, Vercel)
    │  HTTPS + Clerk JWT
    ▼
FastAPI Backend (Python 3.11, Render)
    │
    ├── Agent Pipeline (LangGraph, Gemini 2.5 Flash)
    │       └── EBC (Execution Boundary Controller)
    │
    ├── Supabase PostgreSQL (structured data, RLS)
    ├── MongoDB Atlas (reasoning traces, backtest results)
    └── Alpaca Paper Trading (broker execution)
```

The frontend is a Next.js 16 application using the App Router and TypeScript, styled with Tailwind v4. It is entirely auth-gated via Clerk, which handles Google OAuth and issues JWTs that the frontend attaches to every API request. The backend validates these tokens against Clerk's JWKS endpoint.

The backend is a FastAPI application containerised with Docker and deployed to Render. All API routes are versioned under `/v1/`. Eleven endpoints are live covering pipeline execution, signal management, portfolio data, trade history, override handling, and backtesting job management.

### 3.2 Agent Pipeline Architecture

The agent pipeline is implemented using LangGraph's directed acyclic graph execution model. The pipeline follows a fan-out / fan-in topology with a sequential tail.

```
Market Data Layer
(yfinance: 90-day OHLCV, fundamentals, news; as_of_date constraint)
         │
         ├──────────────────────────────┐
         ▼                              ▼                         ▼
[Technical Analyst]          [Fundamental Analyst]      [Sentiment Analyst]
 RSI, SMA, MACD,              P/E ratio, EPS growth,    Alpaca News API
 Bollinger Bands,             revenue trend,             (as_of_date filtered),
 volume analysis              debt/equity, moat          news headline scoring
         │                              │                         │
         └──────────────────────────────┘─────────────────────────┘
                                        │
                                        ▼
                              [Synthesis Agent]
                          Structured bull/bear debate.
                          Weighs analyst outputs, identifies
                          agreement and contradiction.
                                        │
                                        ▼
                               [Risk Agent]
                          2% portfolio risk rule.
                          2:1 minimum reward-to-risk ratio.
                          Position sizing calculation.
                                        │
                                        ▼
                          [Portfolio Decision Agent]
                          Final BUY / HOLD / SELL signal.
                          Confidence score (0–100).
                          Full reasoning trace to MongoDB.
                                        │
                                        ▼
                    Execution Boundary Controller (EBC)
```

All three specialist agents (Technical, Fundamental, Sentiment) execute in parallel via LangGraph's fan-out mechanism. All LLM calls use Gemini 2.5 Flash with structured JSON output schemas. Latency is tracked per node and stored in the reasoning trace. A factory pattern in `agents/llm/factory.py` ensures no LLM is called directly outside the factory.

A Philosophy Skills overlay is applied at the analyst level. When a mode other than `balanced` is active, the analyst prompts are augmented with the corresponding investment philosophy's reasoning constraints. `buffett` mode, for example, instructs the Fundamental Analyst to prioritise durable competitive advantages and intrinsic value over trailing earnings multiples.

### 3.3 Execution Boundary Controller

The EBC is the architectural element that distinguishes Atlas from all comparable systems. It sits between the Portfolio Decision Agent and the broker adapter, and its behaviour is governed by the user's configured mode.

| Mode | Behaviour | Confidence Threshold | Override Window |
|------|-----------|---------------------|----------------|
| **Advisory** | AI generates BUY / HOLD / SELL signals. All signals queue for human review. Human manually approves each card to place an order. No automated execution. | N/A | N/A |
| **Autonomous** | AI executes all BUY and SELL decisions automatically. No human approval required. Human retains a 5-minute post-execution override window to cancel the order, which is logged to the `override_log` table. | N/A | 5 minutes |
| **Autonomous with Guardrail** | AI auto-executes signals when confidence ≥ 65%. Signals below the threshold are queued for human review. A circuit breaker activates on consecutive losses (configurable threshold) or high portfolio drawdown — pausing auto-execution and notifying the user until they manually resume. This mode is framed as the design ideal: it captures AI speed and scale in high-confidence situations while preserving human oversight at key intersections. | 65% | 5 minutes |

The EBC mode is persisted in the `profiles.boundary_mode` column in Supabase and is read at the start of every pipeline execution. Mode changes take effect on the next pipeline run.

### 3.4 Backtesting Engine

The backtesting engine replays the real Gemini pipeline over historical date ranges rather than substituting a rule-based simulation. This design choice makes backtest results a genuine reflection of AI decision quality rather than a proxy.

Key design decisions:

- `as_of_date` parameter: passed to yfinance data fetchers to truncate OHLCV and fundamental data to what was available on the simulated date. Prevents look-ahead bias for price and financial data.
- Virtual portfolio: `$10,000` starting capital pool, `$1,000` notional per trade position, no short selling in v1.
- Execution price: next trading day's open price after signal date.
- EBC thresholds mirror live configuration — the same 65% threshold applies in backtesting as in live mode.
- Advisory mode backtests produce signal records only; `total_trades` is always zero, giving a clean baseline of signal quality without execution noise.
- Async job management: one running job per user, maximum 90-day date range, progress polled by the frontend.

> **Note:** A known limitation is that the Alpaca News API used for sentiment data in backtesting does not enforce the `as_of_date` constraint with full reliability when falling back to yfinance news. The yfinance news endpoint returns current headlines regardless of the simulated date. This introduces potential look-ahead bias in sentiment signals. For the interim evaluation, this limitation is documented and quarantined; resolution via Alpaca News API's `start`/`end` date parameters is planned as a pre-final-report enhancement (see Section 7).

### 3.5 Database Architecture

**Supabase PostgreSQL** handles all structured relational data. Row-Level Security (RLS) is enabled on all six tables, enforced via `user_id` predicates. Tables: `profiles`, `portfolios`, `positions`, `trades`, `override_log`, `backtest_jobs`. Schema migrations are managed in `database/supabase/migrations/`.

**MongoDB Atlas** handles document-structured data where schema variability and nesting depth make a relational model impractical. Two collections: `reasoning_traces` (one document per pipeline run, containing the full structured output of every agent node) and `backtest_results` (one document per backtest job, containing daily run arrays with per-ticker signal records). The document model is particularly well-suited to reasoning traces, as the output schema of each agent differs in structure and depth.

---

## 4. Implementation

<!-- ~500w -->

### 4.1 Authentication and Authorisation

Authentication is handled end-to-end by Clerk. Users sign in via Google OAuth; Clerk issues a signed JWT which the frontend attaches as a `Bearer` token to every API request. The FastAPI backend verifies the JWT signature against Clerk's JWKS endpoint and extracts the `sub` claim (Clerk user ID) as the authoritative user identity.

A three-tier RBAC model is implemented via a `role` column on the `profiles` table (enum: `user`, `admin`, `superadmin`, default: `user`). Standard users access the dashboard for their own account. Admin users gain access to the `/admin` page, which exposes manual pipeline triggers and system status. The SuperAdmin role additionally permits role assignment and cross-user data visibility for supervisory and demonstration purposes.

### 4.2 Pipeline Execution Flow

A user initiates a pipeline run from the Admin page (or the run is triggered by a scheduled cron job, if enabled). The request specifies a ticker symbol and optionally a Philosophy Skills mode. The backend creates a LangGraph execution graph, passes the market data fetcher the current date (or `as_of_date` in backtest context), runs the three analyst agents in parallel, and sequences through Synthesis, Risk, and Portfolio Decision.

The complete reasoning trace is persisted to MongoDB before the EBC is invoked. This ensures that every signal — including those that are rejected by the user or never executed due to the confidence threshold — has a full audit record. The signal itself is surfaced on the Signals dashboard tab as a card showing the ticker, direction, confidence score, entry and stop-loss prices, and an expandable reasoning trace with agent-by-agent breakdowns.

### 4.3 Backtesting Flow

The user navigates to the Backtest tab on the dashboard and submits a job specifying: one or more tickers, a start and end date (maximum 90-day range), an EBC mode, and a Philosophy Skills mode. The backend validates the request, creates a `backtest_jobs` record in Supabase with status `pending`, and launches the backtesting runner as an asynchronous background task.

The runner iterates day-by-day over the date range, invoking the full Gemini pipeline for each ticker on each trading day with the `as_of_date` parameter set to the simulated date. Executed trades are tracked in the virtual portfolio; positions and cash are updated accordingly. On completion, computed metrics (cumulative return, Sharpe ratio, maximum drawdown, win rate, signal-to-execution rate) and the full `daily_runs` array are written to MongoDB. The Supabase job record status is updated to `completed`. The frontend polls `GET /v1/backtest/{id}` and renders the equity curve and metrics table when the job completes.

### 4.4 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Gemini 2.5 Flash** | Cost-effective for high-frequency structured JSON calls (multiple agents per run, daily batches). Supports structured output schema enforcement. |
| **LangGraph** | Native support for parallel node execution (fan-out/fan-in), explicit state management, and conditional edge routing needed for EBC logic. |
| **MongoDB for traces** | Reasoning trace documents are deeply nested and vary in structure by pipeline version. A relational schema would require constant migration as the pipeline evolves. |
| **Supabase for structured data** | ACID guarantees and RLS on relational tables (trades, portfolios, override log) are non-negotiable for financial data integrity. |
| **Alpaca Paper Trading** | Provides a fully functional broker API with real market data against a paper portfolio — no real money at risk during development and evaluation. |
| **API-first architecture** | The dashboard is one client. Separation of API from UI enables future clients (mobile, developer API), simplifies testing, and allows supervisors and investors to interact with the system programmatically. |
| **Real LLM replay in backtesting** | A rule-based simulation would test the simulation rules, not the AI. Replaying the real Gemini pipeline ensures backtest results directly measure AI decision quality. |

---

## 5. Evaluation Framework

<!-- ~400w -->

### 5.1 Evaluation Philosophy

The core research question — how should execution authority be configured to optimise for both performance and user trust — cannot be answered by quantitative metrics alone. Performance can be measured through backtesting. Trust, perceived control, and decision confidence are qualitative properties that require human subjects. The evaluation framework therefore combines both dimensions into a composite assessment.

### 5.2 Quantitative Metrics (Backtesting)

The following metrics are computed for every completed backtest job:

| Metric | Description |
|--------|-------------|
| **Cumulative Return** | Total portfolio return over the backtest period as a percentage of starting capital. |
| **Sharpe Ratio** (annualised) | Excess return per unit of volatility, annualised from daily returns. Risk-free rate: 5% (approximate US T-bill rate). |
| **Maximum Drawdown** | Largest peak-to-trough decline in portfolio value during the period. Measures downside risk tolerance. |
| **Win Rate** | Proportion of closed trades with a positive return. Closed trades only — open positions at period end are excluded. |
| **Signal-to-Execution Rate** | Proportion of generated signals that resulted in executed trades. In Advisory mode this is always 0%. In Autonomous mode with sufficient confidence it approaches 100%. This metric captures how much of the AI's output is acted upon. |
| **Per-Ticker Contribution** | Breakdown of return contribution by individual ticker, to identify whether performance is driven by a single holding or diversified across the portfolio. |

### 5.3 Qualitative Metrics (User Acceptance Testing)

Phase 5 of the project will conduct UAT with supervisors and recruited test users. The qualitative evaluation instrument will measure:

- **User Confidence**: Self-reported confidence in trading decisions when using each EBC mode.
- **Decision Regret**: Frequency and intensity of regret over outcomes — both executed and missed trades.
- **Reasoning Clarity**: Whether the displayed reasoning traces (agent outputs, synthesis debate, risk parameters) are comprehensible and useful to non-expert users.
- **Mode Preference**: Which EBC mode users prefer after having experienced all three, and why.
- **Override Satisfaction**: In Autonomous mode, whether the 5-minute override window provides sufficient time and sufficient information to make an informed intervention decision.

> **Note:** EBC mode differences are best evaluated through UAT rather than pure backtesting. The three modes use the same AI pipeline and the same signal generation logic — they differ only in execution authority thresholds. Backtesting quantifies signal quality equally across all modes; only UAT can measure how execution authority configuration affects trust and perceived control.

### 5.4 Composite "Optimal Boundary" Score

To aggregate findings across dimensions, a composite score will be computed for each EBC mode:

**Optimal Boundary Score = α · Sharpe(mode) + β · (1 − MaxDrawdown(mode)) + γ · TrustScore(mode) + δ · ExecutionEfficiency(mode)**

Where `α`, `β`, `γ`, `δ` are weighting coefficients to be determined empirically from UAT feedback on the relative importance of each dimension to users. Execution efficiency captures the signal-to-execution rate weighted by trade latency.

### 5.5 Three Experimental Axes

The evaluation matrix covers three independent experimental axes:

**Axis 1 — EBC Mode** (primary axis): Advisory vs. Autonomous vs. Autonomous with Guardrail. This is the central research axis. Quantitative comparison via backtesting metrics across modes; qualitative comparison via UAT. Hypothesis: Autonomous with Guardrail achieves a higher composite score than either extreme.

**Axis 2 — Orchestration Architecture**: v2 parallel fan-out (current) vs. v3 Adaptive Conductor (planned). The v3 conductor is a meta-agent that selectively spawns specialist analysts based on market context — for example, suppressing the Fundamental Analyst for highly liquid large-cap tickers where real-time price action dominates. Evaluated via signal quality metrics and end-to-end pipeline latency.

**Axis 3 — Philosophy Skills**: Buffett / Soros / Lynch / Balanced. Evaluated via backtesting returns across the same tickers and date ranges. The hypothesis is that no single philosophy dominates across all market conditions — Buffett may outperform in low-volatility trending markets, Soros in macro-regime-shift periods, Lynch in consumer-sector bull markets.

---

## 6. Early Results

<!-- ~300w -->

### 6.1 Status of Backtesting Runs

As of the date of this report, backtesting is in active progress. The initial batch covers five tickers — AAPL, MSFT, TSLA, NVDA, and META — across a 60-day historical window, with all four Philosophy Skills modes applied to each ticker. This produces 20 completed backtest jobs in the initial batch (5 tickers × 4 philosophy modes), with EBC mode comparison batches running concurrently.

Backtesting at this scale involves real Gemini API calls for every pipeline run on every trading day, which introduces both cost and latency. The async job management system handles this well — jobs run in the background and results are available when ready. Full quantitative results, equity curves, and cross-mode comparison tables will be included in the final report.

### 6.2 Advisory Mode as Baseline

Advisory mode backtests are being used to establish a signal quality baseline. In Advisory mode, all signals are recorded but no trades are executed. This produces a clean dataset of AI-generated signals against known subsequent price movements, allowing measurement of directional accuracy independent of position sizing or execution timing effects. This baseline is particularly useful for isolating the quality of the underlying AI reasoning from execution implementation details.

### 6.3 Philosophy Skills Preliminary Observations

All four Philosophy Skills modes have been tested against the initial ticker set. Detailed quantitative comparison is pending completion of the full batch, but early observations suggest meaningful divergence in signal frequency and confidence distribution across modes. The `buffett` mode tends to generate fewer but higher-confidence signals, consistent with a value investing philosophy that demands a high margin of safety before acting. The `soros` mode generates more frequent signals with higher variance in confidence, consistent with a macro-reflexivity approach that identifies more inflection points but with more uncertainty. These preliminary patterns will be rigorously quantified in the final report.

### 6.4 Live Pipeline Operation

The live agent pipeline has been operating in paper trading mode, accumulating real pipeline decisions with approve and reject history. This data will contribute to the qualitative phase of the evaluation by providing concrete examples of signal quality, reasoning trace clarity, and execution outcomes for UAT participants to review.

> **Note:** All results reported here are preliminary. Full cross-mode, cross-ticker, cross-philosophy analysis with statistical significance testing will be presented in the final report (due 19 July 2026).

---

## 7. Remaining Work

<!-- ~200w -->

The following components are planned or in progress for completion before the final report:

**v3 Adaptive Conductor**: A meta-agent layer that selects which specialist analysts to invoke based on the market context of the request (e.g., ticker type, volatility regime, available data quality). This replaces the current fixed fan-out with context-sensitive orchestration, and is expected to reduce pipeline latency and improve signal quality in cases where one or more analyst domains have low information value for a given ticker and date.

**Circuit Breaker for Autonomous with Guardrail**: The circuit breaker logic — which pauses auto-execution on consecutive losses or high portfolio drawdown — is specified in the EBC design but not yet fully implemented. The notification system (Telegram message or email alert on trigger) also remains to be built. This is the final component needed to deliver the full Autonomous with Guardrail experience.

**User Acceptance Testing (Phase 5)**: UAT will be conducted with academic and industry supervisors and a recruited cohort of retail investor test users. Results will feed directly into the qualitative dimension of the evaluation framework and the composite Optimal Boundary Score calculation.

**IBKR Production Broker Adapter**: The `BrokerAdapter` protocol in `backend/broker/` is designed for swappable implementations. The Interactive Brokers adapter will be implemented as the production execution layer, replacing Alpaca paper trading for live use after the capstone evaluation period.

**Sentiment Look-Ahead Bias Fix**: The Alpaca News API supports `start`/`end` date parameters. Replacing the yfinance news fallback with date-constrained Alpaca News API calls will close the remaining look-ahead bias gap in the backtesting engine's sentiment data layer.

**Full Philosophy Skills Comparative Analysis**: Complete the backtesting batch and conduct cross-mode, cross-philosophy statistical analysis for inclusion in the final report.

---

## References

Endsley, M. R. (1995). Toward a theory of situation awareness in dynamic systems. *Human Factors*, 37(1), 32–64.

Parasuraman, R., Sheridan, T. B., & Wickens, C. D. (2000). A model for types and levels of human interaction with automation. *IEEE Transactions on Systems, Man, and Cybernetics — Part A*, 30(3), 286–297.

Monetary Authority of Singapore. (2021). *Principles to Promote Fairness, Ethics, Accountability and Transparency (FEAT) in the Use of Artificial Intelligence and Data Analytics in Singapore's Financial Sector*. MAS.

Monetary Authority of Singapore. (2021). *Technology Risk Management Guidelines*. MAS.

Xiao, Y., Li, E., Liu, M., Zheng, Y., Zheng, Z., Liu, P., Roth, D., & Han, J. (2024). TradingAgents: Multi-agents LLM financial trading framework. arXiv:2412.20138.

Yu, S., Li, H., Chen, P., Yao, M., Li, J., Zhou, Z., Cao, Y., & Yan, R. (2023). FinMem: A performance-enhanced LLM trading agent with layered memory and character design. arXiv:2311.13743.

Zhang, J., et al. (2024). AI-Trader: An LLM-based framework for automated financial trading. HKUDS. arXiv:2512.10971.

熵简科技 (AlphaClaw). (2024). *AlphaClaw: Philosophy-driven multi-agent trading framework*. [Open-source release].

24mlight (StockClaw). (2024). *StockClaw: Root-agent framework for AI-assisted equity trading with frozen-dataset backtesting*. [Open-source release].

---

*Word counts: Abstract ~150w | Introduction ~420w | Literature Review ~610w | System Design ~710w | Implementation ~510w | Evaluation Framework ~420w | Early Results ~310w | Remaining Work ~210w | Total ~3,340w*

*Document status: Interim draft — March 2026. Final report due 19 July 2026.*
*Maintained by: Lin Zhenming (Edmund) | lin.zhenming@[sit.edu.sg]*
