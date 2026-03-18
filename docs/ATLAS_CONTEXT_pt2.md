# Product Atlas — Context Briefing (Part 2)

> Part 2: Demo flows, interim report strategy, evaluation framework, investor pitch.
> Part 1: Product state, architecture, competitive positioning.
> Updated 18 March 2026.

---

## 1. Demo Flows

These are the six user journeys that must work flawlessly for both the interim report demo and the investor pitch. Each flow demonstrates a different aspect of Atlas's value proposition.

### Flow 1: First-Time User Onboarding

**Shows**: Product is real, auth works, user gets set up in under 60 seconds.

```
[Start] User visits atlas-broker-frontend-uat.vercel.app
  → Sees landing page: ticker tape, three-mode explainer, CTA
  → Clicks "Get Started" → redirected to /login
  → Signs in with Google OAuth (Clerk)
  → AuthSync fires: Supabase profile created (boundary_mode: advisory), portfolio record created
  → Redirected to /dashboard → Overview tab loads with empty portfolio
  → User navigates to Settings tab → sees Advisory mode pre-selected
[End] User is authenticated, profile exists, ready to receive signals.
```

**What this proves to investors**: Real product, real auth, real user state. Not a demo video with fake data.

---

### Flow 2: Running the AI Pipeline (The "Wow" Moment)

**Shows**: Multi-agent reasoning in action. Three analysts debate, AI produces a structured trade thesis with full transparency.

```
[Start] User navigates to /admin (or investor watches admin do it)
  → Enters ticker: AAPL, selects boundary_mode: conditional
  → Clicks "Run Pipeline"
  → POST /v1/pipeline/run fires
  → Backend runs LangGraph: Technical + Fundamental + Sentiment in parallel
  → Fan-in → Synthesis (bull case vs bear case) → Risk (2% rule, stop-loss, take-profit) → Portfolio Decision
  → Full reasoning trace saved to MongoDB
  → Response returns: action (BUY), confidence (0.67), reasoning, risk params, trace_id
  → Signal appears in /dashboard Signals tab with confidence bar + full risk breakdown
[End] User sees a fully reasoned trade recommendation with every step visible.
```

**What this proves to investors**: This is not a black box. The AI shows its work — every analyst's opinion, the debate, the risk parameters. No other retail tool does this.

**Key talking point**: "Open the reasoning trace. See how the technical analyst said BUY based on RSI oversold + SMA crossover, but the fundamental analyst said HOLD because P/E is elevated. The synthesis agent weighed both views and produced a unified thesis. That's what you're paying for — not a signal, but the reasoning behind the signal."

---

### Flow 3: Conditional Mode — Human Approves a Trade

**Shows**: The EBC in action. AI proposes, human decides. Full audit trail.

```
[Start] Signal is visible in /dashboard Signals tab (status: awaiting_approval)
  → User reviews: action (BUY AAPL), confidence (0.67), stop-loss ($175), take-profit ($195), R/R ratio (2:1)
  → User clicks "Approve"
  → POST /v1/signals/{id}/approve fires
  → Backend: idempotency check → places market order via AlpacaAdapter → writes to Supabase trades table → updates MongoDB trace (execution.executed = true, order_id set)
  → Signal status updates to "executed" in the UI
  → Position appears in Positions tab with live P&L from Alpaca
  → Trade appears in trades history
[End] Trade executed, fully logged in both databases, position tracking live.
```

**What this proves to investors**: Conditional mode is the sweet spot for most users. AI does the heavy lifting, human retains final authority. Full audit trail for compliance.

---

### Flow 4: Conditional Mode — Human Rejects a Trade

**Shows**: The AI is not in charge. The human can say no, and the system respects it.

```
[Start] Signal in Signals tab (status: awaiting_approval)
  → User reviews the reasoning, disagrees with the thesis
  → Clicks "Reject"
  → POST /v1/signals/{id}/reject fires
  → MongoDB trace updated: execution.rejected = true
  → Signal status changes to "rejected" in the UI
  → No order placed, no position opened
[End] Decision logged. AI learns nothing was wrong — human simply disagreed. Trace preserved for future analysis.
```

**What this proves to investors**: User control is real, not cosmetic. Rejection is persisted — this data becomes valuable for studying trust calibration (academic angle) and improving the AI over time (product angle).

---

### Flow 5: Autonomous Mode — AI Executes, Human Overrides

**Shows**: The premium tier. AI acts autonomously but the human has an emergency brake.

```
[Start] User sets boundary_mode to "autonomous" in Settings
  → Boundary mode persisted to Supabase profiles table
  → User (or scheduled job) triggers pipeline for TSLA
  → AI confidence = 0.71 (above 65% threshold)
  → EBC auto-executes: places Alpaca order immediately
  → Trade logged to Supabase, trace logged to MongoDB
  → Signal appears in dashboard as "executed" with override button visible
  → User reviews, decides this was wrong (e.g., missed an earnings announcement)
  → Clicks "Override"
  → POST /v1/trades/{id}/override fires
  → Backend: cancels Alpaca order → writes to override_log (timestamp, reason, trade_id)
  → Trade status updates to "overridden" in UI
[End] AI acted, human intervened, everything logged. Override audit trail exists for compliance.
```

**What this proves to investors**: This is the premium feature. Full automation with a safety net. The override_log is the audit trail that regulators and compliance teams will eventually require. Atlas builds this in from day one.

---

### Flow 6: The Reasoning Trace Deep Dive

**Shows**: Full transparency. Every step of the AI's decision-making is inspectable.

```
[Start] User clicks on any signal in the Signals tab
  → Expands to show full reasoning trace (or navigates to trace detail view)
  → Sees three analyst panels:
    - Technical: RSI 42.3 (neutral), 20-day SMA crossed above 50-day (bullish), volume trending up
    - Fundamental: P/E 28.5 (above sector avg), EPS growth 12% (solid), analyst consensus: overweight
    - Sentiment: 7/10 headlines positive, key themes: AI spending, data center expansion
  → Sees Synthesis panel:
    - Bull case: "Strong momentum + positive sentiment + earnings growth trajectory"
    - Bear case: "Elevated valuation + potential Fed hawkishness"
    - Verdict: BUY with 0.67 confidence
  → Sees Risk panel:
    - Stop-loss: $175.00 (5% below entry)
    - Take-profit: $195.00 (2:1 reward/risk)
    - Position size: 5% of portfolio
  → Sees execution status: approved, order_id, timestamp
[End] User has full visibility into exactly why the AI made this recommendation.
```

**What this proves to investors**: "Show me one other retail AI trading tool that gives you this level of transparency. Trade Ideas doesn't. Composer doesn't. 3Commas doesn't. This is institutional-grade explainability at a retail price point."

---

## 2. Investor Demo Script (10 minutes)

**Minute 0–1: The Problem** (show, don't tell)
Open Trade Ideas Holly AI. Point at a signal. Ask: "Why did it recommend this?" No answer. That's the problem. 89% of trading volume is AI-driven, but retail investors can't see inside the box.

**Minute 1–3: The Solution** (Flow 2)
Run the pipeline on AAPL. Watch three analysts reason in parallel. Show the bull/bear debate. Show the risk parameters. "This is what institutional trading desks have. We're bringing it to retail."

**Minute 3–5: The Product** (Flow 3)
Show Conditional mode. Approve a trade. Watch it hit Alpaca. Show the position appear in real-time. "The user stays in control. The AI does the analysis. The human makes the call."

**Minute 5–7: The Moat** (Flow 5 + Flow 6)
Switch to Autonomous mode. Show auto-execution. Show the override. Open the reasoning trace. "No other retail platform offers configurable execution authority with this level of transparency."

**Minute 7–8: The Business**
Three tiers: Free (Advisory, signal only — viral growth), Pro $30–50/mo (Conditional), Premium $80–120/mo (Autonomous). Developer API with OpenAPI docs. "We're not just a dashboard. We're a platform."

**Minute 8–9: The Market**
SG retail trading is booming (moomoo, Tiger, Syfe). EU mandating XAI for financial systems. $54B crypto bot market, but US equities AI trading for retail is wide open. "We're the first mover in a lane with no competition."

**Minute 9–10: The Ask**
"I'm dogfooding this right now with my own money via paper trading. Real money via IBKR is next. I'm looking for [investment amount / partnership type] to accelerate from paper to production."

---

## 3. Interim Report Strategy (Due 12 April 2026)

### Readiness: Strong.

The system is ahead of schedule. All endpoints live, all gaps closed, auth integrated, Alpaca connected. Most capstone teams are still in architecture phase. You have a deployed, authenticated, working product.

### The narrative

"We built a working multi-agent AI trading system with a novel configurable execution authority mechanism. Here's the system design, implementation evidence, the evaluation framework, and early results from paper trading sessions."

### Seven sections

**1. Introduction & Problem Statement** (2–3 pages)
Retail AI trading tools are binary: signal-only or fully autonomous. No configurable authority. No reasoning transparency. Frame via Singapore context: moomoo, Tiger Brokers, Syfe Trade growing rapidly; MAS AI governance principles; SGX retail investor protection. The gap: no tool lets retail investors configure how much authority they delegate to AI.

**2. Literature Review** (3–4 pages)
- TradingAgents (arxiv 2412.20138) — multi-agent architecture
- FinMem (arxiv 2311.13743) — layered memory for trading agents
- AI-Trader (HKUDS) — benchmarking LLMs in trading
- AlphaClaw (熵简科技) — philosophy skills, named investment frameworks
- StockClaw — root-agent pattern, frozen-dataset backtesting
- Trade Ideas Holly, Composer, 3Commas — commercial competitive analysis
- IOSCO 2025 AI report — regulatory context

**3. System Design** (4–5 pages) — YOUR STRONGEST SECTION
Architecture diagram. Agent pipeline with parallel fan-out. EBC state machine. Broker abstraction. Database dual-layer (Supabase + MongoDB). Auth flow (Clerk → JWT → RLS). Include the actual reasoning trace JSON structure. This section alone differentiates your report from every other capstone.

**4. Implementation** (3–4 pages)
Screenshots of every flow (Flows 1–6 above). Pipeline run with actual output. Reasoning trace document. Signal approval with Alpaca order confirmation. Per-node latency breakdown. Show the deployed UAT URLs.

**5. Evaluation Framework** (2–3 pages)
Define metrics (see Section 4 below). Define the composite "optimal boundary" score. Design the UAT protocol. Explain the three experimental axes (EBC mode, orchestration version, philosophy skills). This section is forward-looking — it tells the examiner what you'll measure and how, even if results come later.

**6. Early Results** (2–3 pages)
Run 5–10 paper trading sessions between now and April 10. Use different tickers (AAPL, MSFT, TSLA, NVDA, META) and all three modes. Show the reasoning traces side by side. Even flat or negative returns are fine — the point is the system works and produces consistent, traceable decisions.

**7. Remaining Work** (1 page)
Frame honestly: backtesting engine (Phase 3), full UAT (Phase 5), IBKR production adapter, subscription system. These are planned, not missing.

### What NOT to do

- Don't apologise for gaps — they're closed or on the timeline
- Don't oversell returns — show the system works, not that it makes money yet
- Don't bury the EBC — it IS the academic contribution, lead every section with it
- Don't make it read like a tutorial — make it read like a research paper with a working system behind it

---

## 4. Evaluation Framework

### Quantitative Metrics (across all three EBC modes)

| Metric | What it measures | Data source |
|--------|-----------------|-------------|
| Cumulative return | Raw P&L | Alpaca + Supabase trades |
| Sharpe ratio | Risk-adjusted return | Daily returns from trade history |
| Maximum drawdown | Worst peak-to-trough loss | Equity curve |
| Trade execution latency | Time from signal to order fill | MongoDB trace timestamps |
| Override frequency | How often humans intervene | Supabase override_log |
| Signal-to-execution rate | % of signals that become trades | MongoDB traces vs Alpaca fills |
| Rejection rate | % of signals rejected by human | MongoDB (execution.rejected) |

### Qualitative Metrics (UAT, Phase 5)

| Metric | What it measures | Collection |
|--------|-----------------|------------|
| User confidence | Trust in AI recommendations | Post-trade Likert scale survey |
| Decision regret | Hindsight satisfaction | Follow-up survey after outcome |
| Reasoning clarity | How well user understood the AI's logic | Rating of trace quality |
| Mode preference | Which mode users gravitate toward | Usage analytics + exit survey |
| Override satisfaction | Did the override feel responsive/effective | Post-override survey |

### Composite "Optimal Boundary" Score

The core academic question: **"What is the optimal human-agent execution boundary for retail AI-assisted trading?"**

"Optimal" = weighted combination:
- **Performance** (Sharpe ratio, normalised 0–1)
- **Risk control** (max drawdown, inverse normalised)
- **User trust** (qualitative composite, normalised)
- **Execution efficiency** (latency + signal-to-execution rate)

Weights determined during Phase 5 UAT. Framework defined now so instrumentation is in place.

### Three Experimental Axes

| Axis | Variable | Levels |
|------|----------|--------|
| 1. EBC Mode | Execution authority | Advisory, Conditional, Autonomous |
| 2. Orchestration | Pipeline intelligence | v2 sequential, v3 adaptive conductor |
| 3. Philosophy Skills | Analyst frameworks | Value / Momentum / Macro weightings |

Axis 1 is tested in the capstone. Axes 2–3 add depth for the final report and are differentiators for the product.

---

## 5. What to Build Next (Priority Order)

### For interim report (by 10 April)

| Task | Why | Effort |
|------|-----|--------|
| Run 5–10 paper trading sessions | Need real results data for report | 1–2 weeks (let them run) |
| Screenshot every demo flow | Report needs visual evidence | 2 hours |
| Write evaluation framework section | Defines what "optimal" means | 1 day |
| Build basic backtesting engine | Even a simple "replay historical data through pipeline" strengthens the report | 3–5 days |

### For investor demo (by whenever they're ready)

| Task | Why | Effort |
|------|-----|--------|
| Polish the landing page | First impression | 1 day |
| Add a "Demo Mode" that auto-runs pipeline on a preset ticker | Investor doesn't need to type | Half day |
| Prepare a 3-ticker comparison view | Show pipeline running on AAPL, TSLA, NVDA side by side | 1–2 days |
| Record a 2-minute Loom video backup | In case live demo fails (it will, eventually) | 1 hour |

### For real money (post-capstone)

| Task | Why | Effort |
|------|-----|--------|
| IBKR adapter | Real money broker | 1 week |
| Stripe subscription integration | Revenue | 1 week |
| Scheduled pipeline runs (cron/worker) | Users shouldn't manually trigger | 2–3 days |
| Telegram/email notifications | Alert users when signals are ready | 2 days |
| Error handling hardening | LLM timeouts, broker failures, rate limits | 1 week |

---

## 6. Product Roadmap

### Phase A: Academic Completion (Apr–Jul 2026)
Backtesting engine, UAT, final evaluation, final report. Close the capstone strong.

### Phase B: Go to Market (Jul–Aug 2026)
Stripe subscriptions. IBKR adapter. Onboarding flow. Developer API docs portal.

### Phase C: Growth (Sep 2026+)
V2: Crypto (Binance/Bybit). V3: NLP strategy creation. V4: Multi-broker. V5: Social (share traces, copy signals). Telegram notifications.

### Subscription Model

| Tier | Mode | Price | Hook |
|------|------|-------|------|
| Free | Advisory | $0 | Signals + full reasoning traces. Viral growth. |
| Pro | Conditional | $30–50/mo | AI proposes, you approve. Training wheels with intelligence. |
| Premium | Autonomous | $80–120/mo | AI executes, you override. Full trust, full transparency. |

Plus: developer API access at each tier. OpenAPI docs auto-generated.

---

## 7. Scope Boundaries

### In Scope (Capstone)

| Item | Status |
|------|--------|
| Multi-agent pipeline (5 agents) | ✅ Done |
| Execution Boundary Controller | ✅ Done |
| Paper trading (Alpaca) | ✅ Done |
| Reasoning trace logging | ✅ Done |
| Auth (Clerk + JWT) | ✅ Done |
| All 5 Supabase tables active | ✅ Done |
| Override window | ✅ Done |
| Signal rejection persistence | ✅ Done |
| Mode persistence | ✅ Done |
| Next.js dashboard (auth-gated) | ✅ Done |
| Backtesting engine | ❌ Not started |
| Structured UAT | ❌ Not started |
| Interim report | ❌ Not started (due 12 Apr) |

### Out of Scope (Capstone)

Real capital, IBKR, Stripe, crypto, multi-broker, UI polish beyond functional.

---

*Last updated: 18 March 2026*
*Maintained by: Lin Zhenming (Edmund)*
