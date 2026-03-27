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
                          │     Risk      │  stop-loss, take-profit, sizing
                          └───────┬───────┘
                                  ▼
                          ┌───────────────┐
                          │   Portfolio   │  final action + confidence score
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
                    │  Controller (EBC)       │  advisory / guardrail / autonomous
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

### Risk
**File:** `risk/agent.py`

Pure Python — no LLM call. Calculates position sizing and risk parameters from the synthesis verdict and technical key levels.

Rules:
- Risk 2% of portfolio per trade (`$2,000` on a `$100,000` reference portfolio)
- Stop-loss: 1% below technical support if available, otherwise 5% below entry
- Take-profit: 2× the risk distance from entry (2:1 R/R)
- Position size: `max_loss / risk_per_share` shares

Outputs: `stop_loss`, `take_profit`, `position_size`, `position_value`, `risk_reward_ratio`, `max_loss_dollars`, `reasoning`

---

### Portfolio Decision
**File:** `portfolio/agent.py`

Takes the synthesis verdict and the full risk assessment and asks the LLM to make a final, committed decision with a calibrated confidence score.

Reads from state: `synthesis`, `risk`

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

After the graph completes, `pipeline_service.py` hands the `AgentSignal` to the **Execution Boundary Controller (EBC)** (`boundary/controller.py`), which applies the user's chosen execution mode:

| Mode | Behaviour |
|---|---|
| `advisory` | Signal returned to user for manual review — no order placed |
| `autonomous_guardrail` | Auto-executes if `confidence ≥ 0.65`; holds for human review otherwise, fires email notification |
| `autonomous` | Always executes; 5-minute override window returned to frontend |

The agents themselves have no knowledge of the EBC — they always produce a signal. Execution mode is enforced entirely outside the graph.

---

## Entry Points

| Path | What it does |
|---|---|
| `orchestrator.run_pipeline()` | Sync wrapper — called by `pipeline_service.py` |
| `orchestrator.run_pipeline_async()` | Async version — used directly in async contexts |
| `graph.get_graph()` | Returns the compiled LangGraph singleton |
