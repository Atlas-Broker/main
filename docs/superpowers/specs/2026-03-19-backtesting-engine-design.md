# Backtesting Engine — Design Spec

**Date:** 2026-03-19
**Author:** Edmund (Lin Zhenming)
**Status:** Approved
**Scope:** Atlas capstone (BAC3004) — interim report support + permanent product feature

---

## 1. Overview

A backtesting engine that replays the actual Atlas AI pipeline (real Gemini calls) across historical date ranges and multiple tickers, simulates trade execution without touching Alpaca, persists all results, and surfaces them in a dedicated dashboard tab.

**Why this matters for the capstone:** The evaluation framework requires empirical results across all three EBC modes (advisory, conditional, autonomous). Backtesting provides this data systematically and reproducibly, without needing to wait for live paper trading sessions.

---

## 2. Scope

### In scope
- Multi-ticker, date-range, EBC-mode backtest jobs
- Full AI pipeline execution per trading day per ticker (real Gemini calls, model from `LLM_DEEP_MODEL` env var)
- Simulated virtual portfolio (no Alpaca, no real orders)
- Async job execution with polling
- Persisted results (Supabase metadata + MongoDB full results)
- Frontend: Backtest tab in dashboard (job list, new job form, results detail)
- Metrics: cumulative return, Sharpe ratio, max drawdown, win rate, signal-to-execution rate, total trades

### Out of scope
- Real broker execution during backtests
- Backtesting with historical sentiment data (known limitation — see Section 7)
- Intraday granularity (daily only)
- Strategy parameter optimisation

---

## 3. Data Model

### Supabase — `backtest_jobs` table

```sql
CREATE TABLE backtest_jobs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL REFERENCES profiles(id),
  status                   text NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued','running','completed','failed')),
  tickers                  text[] NOT NULL,
  start_date               date NOT NULL,
  end_date                 date NOT NULL,
  ebc_mode                 text NOT NULL CHECK (ebc_mode IN ('advisory','conditional','autonomous')),
  initial_capital          float NOT NULL DEFAULT 10000,
  mongo_id                 text,
  total_return             float,
  sharpe_ratio             float,
  max_drawdown             float,
  win_rate                 float,
  total_trades             int,
  signal_to_execution_rate float,
  progress                 int DEFAULT 0,       -- 0–100, formula: (runs_completed / total_runs) * 100
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);

ALTER TABLE backtest_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_scoped" ON backtest_jobs
  FOR ALL USING ((auth.jwt() ->> 'sub') = user_id);
```

### MongoDB — `backtest_results` collection

One document per job:

```json
{
  "_id": "<ObjectId>",
  "job_id": "<uuid matching Supabase>",
  "user_id": "<Clerk user ID>",
  "tickers": ["AAPL", "MSFT", "TSLA"],
  "start_date": "2026-01-01",
  "end_date": "2026-03-01",
  "ebc_mode": "conditional",
  "initial_capital": 10000,
  "daily_runs": [
    {
      "date": "2026-01-05",
      "ticker": "AAPL",
      "action": "BUY",
      "confidence": 0.71,
      "reasoning": "...",
      "executed": true,
      "simulated_price": 245.50,
      "shares": 4,
      "portfolio_value_after": 10240.00,
      "trace_id": "<MongoDB ObjectId of reasoning trace>"
    }
  ],
  "equity_curve": [
    { "date": "2026-01-05", "value": 10240.00 }
  ],
  "metrics": {
    "cumulative_return": 0.082,
    "sharpe_ratio": 1.34,
    "max_drawdown": -0.043,
    "total_trades": 12,
    "signal_to_execution_rate": 0.67,
    "win_rate": 0.58,
    "per_ticker": {
      "AAPL": { "trades": 5, "return_contribution": 0.041 },
      "MSFT": { "trades": 4, "return_contribution": 0.028 },
      "TSLA": { "trades": 3, "return_contribution": 0.013 }
    }
  },
  "created_at": "2026-03-19T10:00:00Z",
  "completed_at": "2026-03-19T10:12:00Z"
}
```

---

## 4. Backend

### Module structure

```
backend/
  backtesting/
    __init__.py
    runner.py       — background task: orchestrates full run
    simulator.py    — virtual portfolio (cash, positions, P&L)
    metrics.py      — Sharpe, drawdown, win rate calculations
  services/
    backtest_service.py   — job CRUD, status updates, results retrieval
  api/routes/
    backtest.py           — 4 REST endpoints
```

### API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/backtest` | Required | Create job + start background task |
| `GET` | `/v1/backtest` | Required | List all jobs for user (summary) |
| `GET` | `/v1/backtest/{job_id}` | Required | Job status + full results (polling target) |
| `DELETE` | `/v1/backtest/{job_id}` | Required | Delete job + MongoDB document |

**DELETE behaviour on running jobs:** `DELETE` on a job with `status = "running"` returns `409 Conflict`. The client must wait for completion (or failure) before deletion. This prevents orphaned background tasks continuing to make Gemini API calls after the job record is removed.

### Request schema — POST /v1/backtest

```json
{
  "tickers": ["AAPL", "MSFT", "TSLA"],
  "start_date": "2026-01-01",
  "end_date": "2026-03-01",
  "ebc_mode": "conditional"
}
```

Validation rules:
- `tickers`: 1–10 items, uppercase, valid ticker format
- Date range: max 90 calendar days (cost guardrail)
- `end_date` must be at least 2 calendar days in the past (to ensure next-day execution price is available)
- `initial_capital` is fixed server-side at $10,000 and not user-configurable in this version. If submitted by the client, it is ignored.

**Concurrency limit:** Max 1 running job per user at a time. Submitting a new job while one is `status = "running"` returns `429 Too Many Requests` with message "You already have a backtest running. Please wait for it to complete."

### Background task flow (`runner.py`)

```
1. Mark job status = "running" in Supabase
2. Create MongoDB document (status: running)
3. Compute list of trading days in range (Mon–Fri, skip US market holidays)
   total_runs = len(trading_days) × len(tickers)
4. runs_completed = 0
5. For each trading_day in trading_days:
     For each ticker in tickers:
       a. Run pipeline(ticker, as_of_date=trading_day, boundary_mode=ebc_mode)
          → returns action, confidence, reasoning, risk params, trace_id
          Note: as_of_date constrains yfinance price/fundamental data only.
          Sentiment uses current news (see Section 7).
       b. Simulator.process(action, confidence, ebc_mode, ticker, trading_day)
          → simulates execution, updates virtual portfolio
          → execution price = trading_day+1 open (fetched separately, outside
            the constrained pipeline call — no look-ahead bias since this
            price is historical at the time the backtest runs)
          → if trading_day is the LAST day in the range: mark executed=False,
            skipped_reason="end_of_range" (no next-day price in window)
       c. Append daily_run record to MongoDB
          (include `error` field if step (a) failed: {"action":"ERROR","error":"<msg>"})
       d. runs_completed += 1
     e. After all tickers for this day: append equity_curve entry
        { "date": trading_day, "value": total_portfolio_value }
     f. Update progress = (runs_completed / total_runs) * 100 in Supabase
        (one write per trading day, not per ticker)
6. Compute aggregate metrics (metrics.py)
7. Write final equity_curve + metrics to MongoDB
8. Update Supabase row: status=completed, all metric columns, completed_at
```

**Error handling:** If a single pipeline call fails, log the error in the daily_run record (action="ERROR") and continue. The job fails only if >50% of runs error.

### Pipeline integration (`orchestrator.py`)

Add one optional parameter:

```python
def run_pipeline(
    ticker: str,
    boundary_mode: str,
    user_id: str,
    as_of_date: date | None = None,   # NEW — constrains yfinance lookback window
) -> PipelineResult: ...
```

When `as_of_date` is set, all **yfinance** data fetches (price, fundamentals) use it as the `end` date, constraining the price/fundamental data to what was available on that date.

**Important:** `as_of_date` does NOT constrain the sentiment agent. Sentiment analysis will run on current news available at the time the backtest executes, not on news from the historical date. This is a known limitation (see Section 7) and should be noted in any research output.

### Simulator logic (`simulator.py`)

**Capital model:** Single shared pool of $10,000 across all tickers. All tickers draw from and return to the same cash balance. This matches the real EBC behaviour where a single user account funds all trades.

- Fixed $1,000 notional per trade (mirrors live EBC config)
- If available cash < $1,000: skip execution for that signal, log as "skipped_insufficient_funds"
- EBC mode execution thresholds (mirroring `boundary/modes.py`):
  - Advisory: never execute (log signals only; win_rate and total_trades will be 0)
  - Conditional: execute if `confidence >= 0.60`
  - Autonomous: execute if `confidence >= 0.65`
- Execution price: next trading day's open price, fetched via yfinance **separately** from the pipeline call (not subject to `as_of_date` constraint, as this price is already historical)
- HOLD signals: never execute
- Short selling: not supported — SELL signals only close existing long positions; ignored if no position open

**Profitable trade definition:** A trade is profitable if the position is closed (SELL) at a price above the entry price. Open positions remaining at the end of the backtest window are marked to market at the last available close price and counted as wins or losses accordingly.

**Equity curve:** Computed as total portfolio value (cash + mark-to-market value of all open positions) at end of each trading day.

### Metrics (`metrics.py`)

| Metric | Formula | Notes |
|--------|---------|-------|
| Cumulative return | `(final_value - initial_capital) / initial_capital` | |
| Sharpe ratio | `mean(daily_returns) / std(daily_returns) * sqrt(252)` | Risk-free rate = 0; returns `null` if `std == 0` (displayed as N/A) |
| Max drawdown | `max((peak - trough) / peak)` across equity curve | |
| Win rate | `profitable_trades / total_trades` | Returns `null` if `total_trades == 0` (displayed as N/A); open positions marked to market at end |
| Signal-to-execution rate | `executed_trades / total_signals` | Returns `null` if `total_signals == 0`; advisory mode: always 0/0 → null |
| Total trades | Count of executed orders | Advisory mode: always 0 |
| Per-ticker return contribution | `sum_of_ticker_pnl / initial_capital` | Stored in MongoDB `metrics.per_ticker`; used in frontend breakdown table |

---

## 5. Frontend

### New tab: Backtest (5th tab in dashboard)

Three views:

#### View 1 — Job List (default)
- Header with "+ New Backtest" button
- One card per job showing: tickers, mode, date range, key metrics (return, Sharpe, drawdown), status badge
- Running jobs show a progress bar (progress % from Supabase), auto-refresh every 5s
- Click any completed job → View 3

#### View 2 — New Backtest Form (slide-in panel or modal)
Fields:
- **Tickers** — text input, comma-separated (e.g. `AAPL, MSFT, TSLA`)
- **Start date** / **End date** — date pickers
- **EBC mode** — radio: advisory / conditional / autonomous
- **Cost estimate** — computed client-side: `~{N} AI calls · approx. $${cost}` where N = trading_days × tickers.length and cost = N × $0.001 (labelled as approximate; based on Gemini Flash pricing at time of writing)

On submit:
- `POST /v1/backtest` → returns `job_id`
- Redirect to job list; new job appears with `running` status and polling begins

#### View 3 — Results Detail
- Back button to job list
- Metrics row: Return · Sharpe · Max Drawdown · Win Rate · Trades · Signal Execution Rate
- Equity curve chart (line graph, portfolio value over time)
- Per-ticker breakdown table: ticker, trades, return contribution
- Expandable daily runs table: date, ticker, action, confidence %, executed (Y/N)
- Each row links to the full reasoning trace (same `SignalCard` trace panel pattern)

### Polling
- Only active for jobs with `status === "running"`
- `GET /v1/backtest/{job_id}` every 5 seconds
- Stop polling on `completed` or `failed`

---

## 6. LLM Model

All pipeline calls during backtesting use the model specified in the `LLM_DEEP_MODEL` environment variable (currently `gemini-3-flash-preview`). No separate model configuration is needed — backtesting inherits production model settings.

---

## 7. Known Limitations

| Limitation | Impact | Notes for report |
|------------|--------|------------|
| Sentiment uses current news, not historical | Sentiment signals may not reflect what was available on the backtest date | Document as methodology limitation; treat as "forward-looking sentiment proxy at time of backtest execution" |
| Max 90-day range enforced | Limits test period length | Sufficient for capstone evaluation; can be raised later |
| No short selling | SELL signals only close longs | Consistent with paper trading behaviour |
| Capital shared across tickers | Heavy BUY days across all tickers may exhaust cash | Matches real single-account behaviour |
| Advisory mode produces no trades | win_rate and total_trades are always 0 | Expected; advisory mode is signal-only by design |

---

## 8. Evaluation Framework Alignment

This engine directly supports the three experimental axes from `ATLAS_CONTEXT_pt2.md`:

| Axis | How to test |
|------|-------------|
| EBC Mode (advisory / conditional / autonomous) | Run 3 identical jobs, change only `ebc_mode` |
| Multiple tickers | Single job with `[AAPL, MSFT, TSLA, NVDA, META]` |
| Date range | Any 30–60 day window of historical data |

The metrics produced (Sharpe, drawdown, cumulative return, signal-to-execution rate) map directly to the quantitative metrics table in the evaluation framework.

---

## 9. Migration

One new Supabase migration file (timestamp assigned at implementation time):
```
database/supabase/migrations/<TIMESTAMP>_backtest_jobs.sql
```

No changes to existing tables. No MongoDB schema changes (schemaless).
