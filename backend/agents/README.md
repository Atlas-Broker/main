# Atlas Agent Pipeline

This directory contains the LangGraph-based multi-agent pipeline that generates trading signals for Atlas. Each agent is a discrete node in a directed graph; they communicate exclusively through a shared typed state object.

---

## Pipeline Overview

```
                          ┌─────────────────┐
                          │   fetch_data    │  yfinance + Alpaca News
                          └────────┬────────┘
                   ┌───────────────┼───────────────┐
                   ▼               ▼               ▼
          ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
          │  Technical   │ │ Fundamental  │ │  Sentiment   │  (parallel)
          │   Analyst    │ │   Analyst    │ │   Analyst    │
          └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                 └────────────────┼────────────────┘
                                  ▼
                          ┌───────────────┐
                          │   Synthesis   │  bull/bear debate → verdict
                          └───────┬───────┘
                                  ▼
                          ┌───────────────┐
                          │ fetch_account │  live Alpaca balance (skipped in backtest)
                          └───────┬───────┘
                                  ▼
                          ┌───────────────┐
                          │     Risk      │  stop-loss, take-profit, account-aware sizing
                          └───────┬───────┘
                                  ▼
                          ┌───────────────┐
                          │   Portfolio   │  final action + confidence (all positions)
                          └───────┬───────┘
                                  ▼
                          ┌───────────────┐
                          │  save_trace   │  → MongoDB Atlas
                          └───────────────┘
                                  │
                          (AgentSignal returned to pipeline_service)
                                  ▼
                    ┌─────────────────────────┐
                    │  Execution Boundary     │
                    │  Controller (EBC)       │  advisory / autonomous
                    └─────────────────────────┘
```

---

## Shared State (`state.py`)

All nodes read from and write to a single `AgentState` TypedDict. No agent calls another agent directly — they only read what previous stages deposited into state.

| Field | Type | Set by |
|---|---|---|
| `ticker` | `str` | caller (input) |
| `user_id` | `str` | caller (input) |
| `boundary_mode` | `str` | caller (input) |
| `philosophy_mode` | `str \| None` | caller (input) |
| `as_of_date` | `str \| None` | caller (input, backtest only) |
| `current_positions` | `dict \| None` | caller (input, pre-seeded in backtest); `run_portfolio` (live) |
| `account_info` | `dict \| None` | caller (input, pre-seeded in backtest); `fetch_account` (live) |
| `ohlcv` | `list[dict]` | `fetch_data` |
| `info` | `dict` | `fetch_data` |
| `news` | `list[dict]` | `fetch_data` |
| `current_price` | `float` | `fetch_data` |
| `analyst_outputs` | `dict` (merged via `operator.or_`) | parallel analysts |
| `synthesis` | `dict \| None` | `synthesis` node |
| `risk` | `dict \| None` | `risk` node |
| `portfolio_decision` | `dict \| None` | `portfolio` node |
| `trace_id` | `str \| None` | `save_trace` |

`analyst_outputs` uses `operator.or_` as its LangGraph reducer so the three parallel analyst nodes can each write `{"technical": ...}`, `{"fundamental": ...}`, `{"sentiment": ...}` without overwriting each other.

---

## Backtest / Live Isolation

The `_is_backtest(state)` helper returns `True` when `as_of_date` is set. Two nodes are gated by this:

- **`fetch_account`** — skips entirely in backtest mode; virtual account info is pre-seeded by `backtesting/runner.py`
- **`run_portfolio`** — skips live Alpaca positions fetch in backtest mode; virtual positions are pre-seeded

In live mode, `fetch_account` calls `get_broker_for_user(user_id).get_account()` and `run_portfolio` calls `get_broker_for_user(user_id).get_positions()` to get real account state.

---

## Node Reference

### `fetch_data`
**File:** `data/market.py`

Fetches all market data in parallel using `asyncio.gather`:

- **OHLCV** — 90 days of daily candles via yfinance (`fetch_ohlcv`)
- **Company info** — fundamentals snapshot via yfinance (`fetch_info`)
- **News** — for live runs: yfinance news. For backtest runs (`as_of_date` set): Alpaca News API filtered to before `as_of_date` to prevent look-ahead bias

Writes: `ohlcv`, `info`, `news`, `current_price`

---

### Technical Analyst
**File:** `analysts/technical.py`

Computes indicators from OHLCV in Python (RSI-14, SMA-20/50/200, price momentum, volume ratio), then sends them alongside the last 10 candles to the LLM for a swing-trading read.

Outputs: `signal` (BUY/SELL/HOLD), `trend`, `key_levels` (support/resistance), `reasoning`, `indicators`, `latency_ms`

LLM tier: **quick** (`gemini-2.5-flash`)

---

### Fundamental Analyst
**File:** `analysts/fundamental.py`

Pulls 14 financial metrics from `info` (P/E, P/B, revenue growth, debt/equity, ROE, analyst target, etc.) and asks the LLM to assess valuation and growth quality.

Outputs: `signal`, `valuation` (undervalued/fairly_valued/overvalued), `upside_to_target_pct`, `reasoning`, `metrics`, `latency_ms`

LLM tier: **quick**

---

### Sentiment Analyst
**File:** `analysts/sentiment.py`

Takes up to 10 news headlines and asks the LLM to score market mood and identify dominant themes.

Outputs: `signal`, `sentiment_score` (−1.0 to +1.0), `dominant_themes`, `reasoning`, `latency_ms`

LLM tier: **quick**

---

### Synthesis
**File:** `synthesis/agent.py`

Waits for all three analysts (LangGraph fan-in), then runs a bull/bear debate prompt — presenting each analyst's reasoning and asking the LLM to argue both sides and reach a verdict.

Reads from state: `analyst_outputs.technical`, `analyst_outputs.fundamental`, `analyst_outputs.sentiment`

Outputs: `verdict` (BUY/SELL/HOLD), `bull_case`, `bear_case`, `reasoning`, `latency_ms`

LLM tier: **deep** (`gemini-2.5-flash`)

---

### fetch_account
**File:** `graph.py`

Fetches the live Alpaca account balance (portfolio_value, buying_power, equity) using the per-user broker. Skipped entirely in backtest mode or when `account_info` has been pre-seeded by the caller.

In backtest mode, `backtesting/runner.py` pre-seeds `account_info` with `{"portfolio_value": ..., "buying_power": portfolio.cash, "equity": ...}` so the risk agent sizes positions relative to the virtual portfolio's remaining cash.

---

### Risk
**File:** `risk/agent.py`

Pure Python — no LLM call. Calculates position sizing and risk parameters from the synthesis verdict, technical key levels, and account state.

Rules:
- Risk 2% of portfolio per trade
- Stop-loss: 1% below technical support if available, otherwise 5% below entry
- Take-profit: 2× the risk distance from entry (2:1 R/R)
- Position value: `(2% × portfolio_value) / risk_per_share`, capped at `buying_power × 0.95` when available

Outputs: `stop_loss`, `take_profit`, `position_size`, `position_value`, `risk_reward_ratio`, `max_loss_dollars`, `reasoning`

---

### Portfolio Decision
**File:** `portfolio/agent.py`

Takes the synthesis verdict and the full risk assessment and asks the LLM to make a final, committed decision with a calibrated confidence score. When `current_positions` contains holdings, the prompt includes the full portfolio context so the agent reasons over position concentration and existing exposure, not just the single ticker being analyzed.

Reads from state: `synthesis`, `risk`, `current_positions`

Outputs: `action` (BUY/SELL/HOLD), `confidence` (0.0–1.0), `reasoning`, `latency_ms`

LLM tier: **deep**

---

### `save_trace`
**File:** `memory/trace.py`

Writes the complete pipeline run to MongoDB Atlas (`reasoning_traces` collection), keyed by `user_id` and `ticker`. This document is what powers the Stock AI Log drill-down in the frontend.

Document shape:
```json
{
  "ticker": "AAPL",
  "user_id": "...",
  "boundary_mode": "advisory",
  "created_at": "<UTC timestamp>",
  "pipeline_run": {
    "technical": { ... },
    "fundamental": { ... },
    "sentiment": { ... },
    "synthesis": { ... },
    "risk": { ... },
    "final_decision": { ... }
  }
}
```

---

## Philosophy Skills (`philosophy.py`)

An investment philosophy overlay can be applied to all three analyst nodes simultaneously. The `philosophy_mode` input field is threaded through the graph and each analyst calls `get_philosophy_prefix(philosophy_mode)` to prepend a framing block to their LLM prompt before any other content.

| Mode | Lens |
|---|---|
| `balanced` | Default — no overlay, existing behaviour |
| `buffett` | Intrinsic value, margin of safety, moat durability, long-term owner thinking |
| `soros` | Macro reflexivity, feedback loops, identifying inflection points in prevailing bias |
| `lynch` | GARP (PEG ratio), consumer-lens, early trend identification |

The graph topology does not change — philosophy is prompt-level only.

---

## LLM Factory (`llm/factory.py`)

All LLM calls go through `get_llm(mode)` which returns a `(client, model_id)` tuple. Model IDs are read from environment variables, defaulting to `gemini-2.5-flash` for both tiers. No code changes are needed to upgrade models.

| Tier | Env var | Default | Used by |
|---|---|---|---|
| `quick` | `LLM_QUICK_MODEL` | `gemini-2.5-flash` | Technical, Fundamental, Sentiment analysts |
| `deep` | `LLM_DEEP_MODEL` | `gemini-2.5-flash` | Synthesis, Portfolio Decision |

---

## Orchestrator & EBC Integration

`orchestrator.py` is the stable import surface for `services/pipeline_service.py`. It initialises `AgentState`, invokes the compiled LangGraph graph, and returns an `AgentSignal` Pydantic model.

`run_pipeline_async()` accepts optional `current_positions` and `account_info` parameters. When provided (as in backtesting), these are pre-seeded into the initial state and both `fetch_account` and the live positions fetch are skipped.

After the graph completes, `pipeline_service.py` hands the `AgentSignal` to the **Execution Boundary Controller (EBC)** (`boundary/controller.py`), which applies the user's chosen execution mode:

| Mode | Behaviour |
|---|---|
| `advisory` | Signal returned to user for manual review — no order placed |
| `autonomous` | Auto-executes if `confidence ≥ 0.65`; low-confidence signals held for human review with email notification. 5-minute override window on executed trades. |

Before placing any autonomous order, the EBC calls `broker.get_open_orders(ticker)` and cancels each one to prevent stale orders from accumulating between pipeline runs.

The agents themselves have no knowledge of the EBC — they always produce a signal. Execution mode is enforced entirely outside the graph.

---

## Entry Points

| Path | What it does |
|---|---|
| `orchestrator.run_pipeline()` | Sync wrapper — called by `pipeline_service.py` |
| `orchestrator.run_pipeline_async()` | Async version — used directly by backtesting runner and async contexts |
| `graph.get_graph()` | Returns the compiled LangGraph singleton |
