# Backtesting Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full backtesting engine that replays the real AI pipeline (live Gemini calls) over historical date ranges, simulates trade execution in a virtual portfolio, persists results, and exposes them in a new Backtest dashboard tab.

**Architecture:** Async FastAPI background task creates a job record in Supabase, runs the pipeline per ticker per trading day (real Gemini), simulates execution in a virtual portfolio, writes daily runs + equity curve to MongoDB, then computes and stores aggregate metrics. Frontend polls `GET /v1/backtest/{job_id}` every 5s while running.

**Tech Stack:** FastAPI BackgroundTasks, pymongo, supabase-py, yfinance, pandas (bdate_range), Next.js 16 TypeScript

**Spec:** `docs/superpowers/specs/2026-03-19-backtesting-engine-design.md`

---

## File Map

**New files:**
- `database/supabase/supabase/migrations/20260319120000_backtest_jobs.sql`
- `backend/backtesting/__init__.py`
- `backend/backtesting/simulator.py`
- `backend/backtesting/metrics.py`
- `backend/backtesting/runner.py`
- `backend/services/backtest_service.py`
- `backend/api/routes/backtest.py`
- `backend/tests/test_simulator.py`
- `backend/tests/test_metrics.py`
- `backend/tests/test_backtest_service.py`
- `backend/tests/test_backtest_routes.py`
- `frontend/app/dashboard/BacktestTab.tsx`

**Modified files:**
- `backend/agents/data/market.py` — add `as_of_date` param to `fetch_ohlcv`, add `fetch_next_open`
- `backend/agents/state.py` — add `as_of_date: str | None` field
- `backend/agents/graph.py` — pass `as_of_date` from state to `fetch_ohlcv`
- `backend/agents/orchestrator.py` — add `as_of_date` param to `run_pipeline_async` + `run_pipeline`
- `backend/main.py` — register `backtest` router
- `frontend/app/dashboard/page.tsx` — add Backtest tab + wire up `BacktestTab`

---

## Task 1: Database Migration

**Files:**
- Create: `database/supabase/supabase/migrations/20260319120000_backtest_jobs.sql`

- [ ] **Step 1: Create migration SQL**

```sql
-- Migration: backtest_jobs table
-- Stores backtest job metadata. Full results (daily_runs, equity_curve, metrics)
-- live in MongoDB (backtest_results collection) referenced by mongo_id.

CREATE TABLE public.backtest_jobs (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                   text        NOT NULL DEFAULT 'queued'
                                        CHECK (status IN ('queued','running','completed','failed')),
  tickers                  text[]      NOT NULL,
  start_date               date        NOT NULL,
  end_date                 date        NOT NULL,
  ebc_mode                 text        NOT NULL
                                        CHECK (ebc_mode IN ('advisory','conditional','autonomous')),
  initial_capital          float       NOT NULL DEFAULT 10000,
  mongo_id                 text,
  total_return             float,
  sharpe_ratio             float,
  max_drawdown             float,
  win_rate                 float,
  total_trades             int,
  signal_to_execution_rate float,
  progress                 int         NOT NULL DEFAULT 0,
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);

ALTER TABLE public.backtest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own backtest jobs"
  ON public.backtest_jobs FOR ALL
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase project → SQL Editor → paste the SQL → Run.
Verify: Table `backtest_jobs` appears in Table Editor with correct columns.

- [ ] **Step 3: Commit**

```bash
git add database/supabase/supabase/migrations/20260319120000_backtest_jobs.sql
git commit -m "feat: add backtest_jobs migration"
```

---

## Task 2: Pipeline `as_of_date` Support

**Files:**
- Modify: `backend/agents/data/market.py`
- Modify: `backend/agents/state.py`
- Modify: `backend/agents/graph.py`
- Modify: `backend/agents/orchestrator.py`
- Test: `backend/tests/test_market_as_of_date.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_market_as_of_date.py`:

```python
# backend/tests/test_market_as_of_date.py
from unittest.mock import patch, MagicMock
import pandas as pd
from datetime import datetime


def _make_ohlcv_df(dates, opens=None):
    """Helper: build a minimal yfinance-style DataFrame."""
    n = len(dates)
    opens = opens or [100.0] * n
    data = {
        ("Open",   "AAPL"): opens,
        ("High",   "AAPL"): [101.0] * n,
        ("Low",    "AAPL"): [99.0]  * n,
        ("Close",  "AAPL"): [100.5] * n,
        ("Volume", "AAPL"): [1_000_000] * n,
    }
    idx = pd.to_datetime(dates)
    return pd.DataFrame(data, index=idx)


def test_fetch_ohlcv_with_as_of_date_calls_yfinance_with_date_range():
    mock_df = _make_ohlcv_df(["2026-01-05", "2026-01-06"])
    with patch("agents.data.market.yf.download", return_value=mock_df) as mock_dl:
        from agents.data.market import fetch_ohlcv
        result = fetch_ohlcv("AAPL", as_of_date="2026-01-10")
    call_kwargs = mock_dl.call_args[1]
    assert "start" in call_kwargs
    assert "end" in call_kwargs
    assert "period" not in call_kwargs
    assert len(result) == 2


def test_fetch_ohlcv_without_as_of_date_uses_period():
    mock_df = _make_ohlcv_df(["2026-01-05"])
    with patch("agents.data.market.yf.download", return_value=mock_df) as mock_dl:
        from agents.data.market import fetch_ohlcv
        fetch_ohlcv("AAPL")
    call_kwargs = mock_dl.call_args[1]
    assert "period" in call_kwargs
    assert "start" not in call_kwargs


def test_fetch_next_open_returns_first_available_open():
    mock_df = _make_ohlcv_df(["2026-01-06"], opens=[246.0])
    with patch("agents.data.market.yf.download", return_value=mock_df):
        from agents.data.market import fetch_next_open
        price = fetch_next_open("AAPL", after_date="2026-01-05")
    assert price == 246.0


def test_fetch_next_open_returns_none_when_no_data():
    empty_df = pd.DataFrame()
    with patch("agents.data.market.yf.download", return_value=empty_df):
        from agents.data.market import fetch_next_open
        price = fetch_next_open("AAPL", after_date="2026-01-05")
    assert price is None
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_market_as_of_date.py -v
```
Expected: `ImportError` or `AttributeError` — `fetch_next_open` doesn't exist yet.

- [ ] **Step 3: Modify `backend/agents/data/market.py`**

```python
"""Market data fetcher — wraps yfinance for OHLCV, fundamentals, and news."""

from datetime import datetime, timedelta
import yfinance as yf


def fetch_ohlcv(
    ticker: str,
    period: str = "90d",
    interval: str = "1d",
    as_of_date: str | None = None,
) -> list[dict]:
    if as_of_date:
        end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
        start_dt = end_dt - timedelta(days=90)
        # end is exclusive in yfinance — add 1 day to include as_of_date
        df = yf.download(
            ticker,
            start=start_dt.strftime("%Y-%m-%d"),
            end=(end_dt + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval=interval,
            progress=False,
        )
    else:
        df = yf.download(ticker, period=period, interval=interval, progress=False)

    if df.empty:
        return []
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    df = df.reset_index()
    date_col = "Datetime" if "Datetime" in df.columns else "Date"
    return [
        {
            "date": str(row[date_col])[:10],
            "open":   round(float(row["Open"]),   4),
            "high":   round(float(row["High"]),   4),
            "low":    round(float(row["Low"]),    4),
            "close":  round(float(row["Close"]),  4),
            "volume": int(row["Volume"]),
        }
        for _, row in df.iterrows()
    ]


def fetch_next_open(ticker: str, after_date: str) -> float | None:
    """Return the first available open price strictly after after_date."""
    start_dt = datetime.strptime(after_date, "%Y-%m-%d") + timedelta(days=1)
    end_dt = start_dt + timedelta(days=7)  # buffer for weekends/holidays
    df = yf.download(
        ticker,
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
        interval="1d",
        progress=False,
    )
    if df.empty:
        return None
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    return float(df["Open"].iloc[0])


def fetch_info(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    info = t.info or {}
    keys = [
        "shortName", "sector", "industry",
        "trailingPE", "forwardPE", "priceToBook",
        "revenueGrowth", "earningsGrowth", "profitMargins",
        "debtToEquity", "returnOnEquity", "currentRatio",
        "marketCap", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
        "currentPrice", "targetMeanPrice", "recommendationMean",
    ]
    return {k: info.get(k) for k in keys}


def fetch_news(ticker: str) -> list[dict]:
    t = yf.Ticker(ticker)
    news = t.news or []
    return [
        {
            "title": n.get("content", {}).get("title", ""),
            "published": n.get("content", {}).get("pubDate", ""),
        }
        for n in news[:10]
    ]
```

- [ ] **Step 4: Add `as_of_date` to `AgentState`**

In `backend/agents/state.py`, add one line to the TypedDict:

```python
class AgentState(TypedDict):
    # Inputs
    ticker: str
    user_id: str
    boundary_mode: str
    as_of_date: str | None   # ISO date; when set, constrains yfinance lookback

    # Market data (populated by fetch_data node)
    ohlcv: list[dict]
    info: dict
    news: list[dict]
    current_price: float

    # Analyst outputs — merged by operator.or_ so parallel nodes
    # can each add their key without overwriting each other
    analyst_outputs: Annotated[dict, operator.or_]

    # Sequential stage outputs
    synthesis: dict | None
    risk: dict | None
    portfolio_decision: dict | None
    trace_id: str | None
```

- [ ] **Step 5: Thread `as_of_date` through `graph.py`**

In `backend/agents/graph.py`, update `fetch_data`:

```python
async def fetch_data(state: AgentState) -> dict:
    ticker = state["ticker"]
    as_of_date = state.get("as_of_date")
    ohlcv, info, news = await asyncio.gather(
        asyncio.to_thread(market.fetch_ohlcv, ticker, as_of_date=as_of_date),
        asyncio.to_thread(market.fetch_info, ticker),
        asyncio.to_thread(market.fetch_news, ticker),
    )
    current_price = info.get("currentPrice") or (ohlcv[-1]["close"] if ohlcv else 0.0)
    return {
        "ohlcv": ohlcv,
        "info": info,
        "news": news,
        "current_price": current_price,
        "analyst_outputs": {},
        "as_of_date": as_of_date,  # preserve for downstream nodes
    }
```

- [ ] **Step 6: Update `orchestrator.py`**

Replace both `run_pipeline_async` and `run_pipeline` with:

```python
async def run_pipeline_async(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
    as_of_date: str | None = None,
) -> AgentSignal:
    start = time.time()
    graph = get_graph()

    initial_state = {
        "ticker": ticker,
        "user_id": user_id,
        "boundary_mode": boundary_mode,
        "as_of_date": as_of_date,
        "analyst_outputs": {},
        "synthesis": None,
        "risk": None,
        "portfolio_decision": None,
        "trace_id": None,
    }

    final_state = await graph.ainvoke(initial_state)
    decision = final_state["portfolio_decision"]
    risk = final_state["risk"]

    return AgentSignal(
        ticker=ticker,
        action=decision["action"],
        confidence=decision["confidence"],
        reasoning=decision["reasoning"],
        trace_id=final_state.get("trace_id", ""),
        boundary_mode=boundary_mode,
        risk={
            "stop_loss": risk["stop_loss"],
            "take_profit": risk["take_profit"],
            "position_size": risk["position_size"],
            "risk_reward_ratio": risk["risk_reward_ratio"],
        },
        latency_ms=round((time.time() - start) * 1000),
    )


def run_pipeline(
    ticker: str,
    boundary_mode: str = "advisory",
    user_id: str = "system",
    as_of_date: str | None = None,
) -> AgentSignal:
    """Sync wrapper — safe to call from FastAPI sync route handlers."""
    return asyncio.run(run_pipeline_async(ticker, boundary_mode, user_id, as_of_date))
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_market_as_of_date.py -v
```
Expected: All 4 PASS.

- [ ] **Step 8: Verify existing tests still pass**

```bash
cd backend && uv run pytest tests/ -v --ignore=tests/test_signals_integration.py
```
(Skip integration test — it requires live DB. All others should be green.)

- [ ] **Step 9: Commit**

```bash
git add backend/agents/data/market.py backend/agents/state.py \
        backend/agents/graph.py backend/agents/orchestrator.py \
        backend/tests/test_market_as_of_date.py
git commit -m "feat: add as_of_date support to pipeline for backtesting"
```

---

## Task 3: Virtual Portfolio Simulator

**Files:**
- Create: `backend/backtesting/__init__.py` (empty)
- Create: `backend/backtesting/simulator.py`
- Test: `backend/tests/test_simulator.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_simulator.py`:

```python
# backend/tests/test_simulator.py
import pytest
from backtesting.simulator import VirtualPortfolio


def _make_portfolio():
    return VirtualPortfolio(initial_capital=10000.0)


# ── Advisory mode ────────────────────────────────────────────────────────────

def test_advisory_never_executes():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "BUY", 0.99, "advisory", 200.0, False)
    assert result["executed"] is False
    assert result.get("reason") == "advisory_mode"
    assert p.cash == 10000.0  # unchanged


# ── Conditional thresholds ────────────────────────────────────────────────────

def test_conditional_below_threshold_does_not_execute():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "BUY", 0.59, "conditional", 200.0, False)
    assert result["executed"] is False


def test_conditional_at_threshold_executes():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "BUY", 0.60, "conditional", 200.0, False)
    assert result["executed"] is True
    assert result["action"] == "BUY"


# ── Autonomous threshold ──────────────────────────────────────────────────────

def test_autonomous_at_threshold_executes():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "BUY", 0.65, "autonomous", 200.0, False)
    assert result["executed"] is True


# ── Last day edge case ────────────────────────────────────────────────────────

def test_last_day_signal_skipped():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "BUY", 0.99, "autonomous", 200.0, True)
    assert result["executed"] is False
    assert result.get("skipped_reason") == "end_of_range"


# ── HOLD never executes ───────────────────────────────────────────────────────

def test_hold_signal_not_executed():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "HOLD", 0.80, "autonomous", 200.0, False)
    assert result["executed"] is False


# ── BUY mechanics ─────────────────────────────────────────────────────────────

def test_buy_deducts_notional_from_cash():
    p = _make_portfolio()
    p.process("2026-01-05", "AAPL", "BUY", 0.70, "autonomous", 200.0, False)
    assert p.cash == pytest.approx(9000.0)


def test_buy_creates_position():
    p = _make_portfolio()
    p.process("2026-01-05", "AAPL", "BUY", 0.70, "autonomous", 200.0, False)
    assert "AAPL" in p.positions
    assert p.positions["AAPL"].shares == pytest.approx(5.0)


def test_insufficient_funds_skips():
    p = _make_portfolio()
    p.cash = 500.0  # below $1000 notional
    result = p.process("2026-01-05", "AAPL", "BUY", 0.80, "autonomous", 200.0, False)
    assert result["executed"] is False
    assert result.get("skipped_reason") == "insufficient_funds"


# ── SELL mechanics ────────────────────────────────────────────────────────────

def test_sell_without_position_skipped():
    p = _make_portfolio()
    result = p.process("2026-01-05", "AAPL", "SELL", 0.80, "autonomous", 200.0, False)
    assert result["executed"] is False


def test_sell_closes_position_and_returns_cash():
    p = _make_portfolio()
    p.process("2026-01-05", "AAPL", "BUY",  0.70, "autonomous", 200.0, False)
    result = p.process("2026-01-06", "AAPL", "SELL", 0.70, "autonomous", 220.0, False)
    assert result["executed"] is True
    assert result["action"] == "SELL"
    assert "AAPL" not in p.positions
    assert result["pnl"] == pytest.approx(5 * (220.0 - 200.0))  # 5 shares * $20


# ── Portfolio value ───────────────────────────────────────────────────────────

def test_portfolio_value_includes_mark_to_market():
    p = _make_portfolio()
    p.process("2026-01-05", "AAPL", "BUY", 0.70, "autonomous", 200.0, False)
    value = p.portfolio_value({"AAPL": 210.0})
    # cash=9000 + 5 shares * 210 = 9000 + 1050 = 10050
    assert value == pytest.approx(10050.0)


# ── Mark to market at end ─────────────────────────────────────────────────────

def test_mark_to_market_closes_all_positions():
    p = _make_portfolio()
    p.process("2026-01-05", "AAPL", "BUY", 0.70, "autonomous", 200.0, False)
    p.mark_to_market_positions({"AAPL": 210.0})
    assert len(p.positions) == 0
    assert p.cash == pytest.approx(10050.0)
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && uv run pytest tests/test_simulator.py -v
```
Expected: `ModuleNotFoundError: No module named 'backtesting'`

- [ ] **Step 3: Create `backend/backtesting/__init__.py`**

```python
# empty
```

- [ ] **Step 4: Create `backend/backtesting/simulator.py`**

```python
# backend/backtesting/simulator.py
"""
Virtual portfolio simulator for backtesting.

Mirrors EBC execution thresholds from boundary/modes.py without
touching the real broker. Uses a single shared capital pool.
"""
from __future__ import annotations
from dataclasses import dataclass, field

NOTIONAL = 1000.0  # $1,000 per trade — matches live EBC config

CONFIDENCE_THRESHOLDS: dict[str, float | None] = {
    "advisory":    None,   # never execute
    "conditional": 0.60,
    "autonomous":  0.65,
}


@dataclass
class Position:
    ticker: str
    shares: float
    avg_cost: float
    entry_date: str


@dataclass
class VirtualPortfolio:
    initial_capital: float = 10000.0
    cash: float = field(init=False)
    positions: dict[str, Position] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.cash = self.initial_capital

    def process(
        self,
        date: str,
        ticker: str,
        action: str,
        confidence: float,
        ebc_mode: str,
        execution_price: float | None,
        is_last_day: bool,
    ) -> dict:
        threshold = CONFIDENCE_THRESHOLDS.get(ebc_mode)

        if threshold is None:
            return {"executed": False, "reason": "advisory_mode"}
        if is_last_day:
            return {"executed": False, "skipped_reason": "end_of_range"}
        if action == "HOLD":
            return {"executed": False, "reason": "hold_signal"}
        if confidence < threshold:
            return {"executed": False, "reason": "below_threshold"}
        if execution_price is None:
            return {"executed": False, "reason": "no_price_data"}

        if action == "BUY":
            return self._execute_buy(date, ticker, execution_price)
        if action == "SELL":
            return self._execute_sell(ticker, execution_price)
        return {"executed": False, "reason": "unknown_action"}

    def _execute_buy(self, date: str, ticker: str, price: float) -> dict:
        if self.cash < NOTIONAL:
            return {"executed": False, "skipped_reason": "insufficient_funds"}
        shares = NOTIONAL / price
        self.cash -= NOTIONAL
        if ticker in self.positions:
            existing = self.positions[ticker]
            total = existing.shares + shares
            avg = (existing.shares * existing.avg_cost + shares * price) / total
            self.positions[ticker] = Position(ticker, total, avg, existing.entry_date)
        else:
            self.positions[ticker] = Position(ticker, shares, price, date)
        return {"executed": True, "action": "BUY", "shares": shares, "price": price}

    def _execute_sell(self, ticker: str, price: float) -> dict:
        if ticker not in self.positions:
            return {"executed": False, "reason": "no_position"}
        pos = self.positions.pop(ticker)
        proceeds = pos.shares * price
        self.cash += proceeds
        pnl = (price - pos.avg_cost) * pos.shares
        return {"executed": True, "action": "SELL", "shares": pos.shares, "price": price, "pnl": pnl}

    def portfolio_value(self, current_prices: dict[str, float]) -> float:
        position_value = sum(
            pos.shares * current_prices.get(pos.ticker, pos.avg_cost)
            for pos in self.positions.values()
        )
        return self.cash + position_value

    def mark_to_market_positions(self, current_prices: dict[str, float]) -> list[dict]:
        """Close all open positions at given prices. Mutates cash."""
        results = []
        for ticker, pos in list(self.positions.items()):
            price = current_prices.get(ticker, pos.avg_cost)
            self.cash += pos.shares * price
            pnl = (price - pos.avg_cost) * pos.shares
            results.append({"ticker": ticker, "shares": pos.shares, "price": price, "pnl": pnl, "marked_to_market": True})
        self.positions.clear()
        return results
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_simulator.py -v
```
Expected: All 14 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/backtesting/__init__.py backend/backtesting/simulator.py \
        backend/tests/test_simulator.py
git commit -m "feat: add virtual portfolio simulator for backtesting"
```

---

## Task 4: Metrics Calculator

**Files:**
- Create: `backend/backtesting/metrics.py`
- Test: `backend/tests/test_metrics.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_metrics.py`:

```python
# backend/tests/test_metrics.py
import math
import pytest
from backtesting.metrics import compute_metrics


def _run(executed=True, action="BUY", pnl=None, ticker="AAPL"):
    return {"executed": executed, "action": action, "pnl": pnl, "ticker": ticker}


def test_cumulative_return_positive():
    values = [10000, 10500, 11000]
    result = compute_metrics(values, 10000.0, [])
    assert result["cumulative_return"] == pytest.approx(0.1)


def test_cumulative_return_negative():
    values = [10000, 9500, 9000]
    result = compute_metrics(values, 10000.0, [])
    assert result["cumulative_return"] == pytest.approx(-0.1)


def test_sharpe_returns_none_when_std_zero():
    # All returns identical → std = 0
    values = [10000, 10000, 10000]
    result = compute_metrics(values, 10000.0, [])
    assert result["sharpe_ratio"] is None


def test_sharpe_non_zero_returns_float():
    values = [10000, 10100, 10050, 10200]
    result = compute_metrics(values, 10000.0, [])
    assert result["sharpe_ratio"] is not None
    assert isinstance(result["sharpe_ratio"], float)


def test_max_drawdown_positive():
    values = [10000, 11000, 9000, 10500]  # peak 11000, trough 9000 → 18.18%
    result = compute_metrics(values, 10000.0, [])
    assert result["max_drawdown"] == pytest.approx(-((11000 - 9000) / 11000), rel=1e-3)


def test_win_rate_none_when_no_trades():
    result = compute_metrics([10000], 10000.0, [])
    assert result["win_rate"] is None
    assert result["total_trades"] == 0


def test_win_rate_computed_correctly():
    runs = [
        _run(executed=True,  pnl=50.0),
        _run(executed=True,  pnl=-20.0),
        _run(executed=True,  pnl=30.0),
        _run(executed=False, pnl=None),
    ]
    result = compute_metrics([10000, 10060], 10000.0, runs)
    assert result["total_trades"] == 3
    assert result["win_rate"] == pytest.approx(2 / 3)


def test_signal_to_execution_rate_none_when_no_signals():
    result = compute_metrics([10000], 10000.0, [])
    assert result["signal_to_execution_rate"] is None


def test_signal_to_execution_rate_advisory_zero():
    runs = [
        {"executed": False, "action": "BUY",  "pnl": None, "ticker": "AAPL"},
        {"executed": False, "action": "SELL", "pnl": None, "ticker": "MSFT"},
    ]
    result = compute_metrics([10000, 10000], 10000.0, runs)
    assert result["signal_to_execution_rate"] == pytest.approx(0.0)


def test_per_ticker_return_contribution():
    runs = [
        {"executed": True, "action": "SELL", "pnl": 100.0, "ticker": "AAPL"},
        {"executed": True, "action": "SELL", "pnl":  50.0, "ticker": "MSFT"},
    ]
    result = compute_metrics([10000, 10150], 10000.0, runs)
    assert result["per_ticker"]["AAPL"]["return_contribution"] == pytest.approx(0.01)
    assert result["per_ticker"]["MSFT"]["return_contribution"] == pytest.approx(0.005)


def test_empty_daily_values_returns_empty_metrics():
    result = compute_metrics([], 10000.0, [])
    assert result["cumulative_return"] == 0.0
    assert result["sharpe_ratio"] is None
    assert result["total_trades"] == 0
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && uv run pytest tests/test_metrics.py -v
```
Expected: `ModuleNotFoundError: No module named 'backtesting.metrics'`

- [ ] **Step 3: Create `backend/backtesting/metrics.py`**

```python
# backend/backtesting/metrics.py
"""Aggregate metrics for a completed backtest run."""
import math


def compute_metrics(
    daily_values: list[float],
    initial_capital: float,
    daily_runs: list[dict],
) -> dict:
    if not daily_values:
        return _empty_metrics()

    final_value = daily_values[-1]
    cumulative_return = (final_value - initial_capital) / initial_capital

    # Daily returns
    daily_returns = [
        (daily_values[i] - daily_values[i - 1]) / daily_values[i - 1]
        for i in range(1, len(daily_values))
        if daily_values[i - 1] > 0
    ]

    # Sharpe ratio (risk-free rate = 0)
    sharpe = None
    if len(daily_returns) >= 2:
        n = len(daily_returns)
        mean_r = sum(daily_returns) / n
        variance = sum((r - mean_r) ** 2 for r in daily_returns) / (n - 1)
        std_r = math.sqrt(variance)
        if std_r > 0:
            sharpe = (mean_r / std_r) * math.sqrt(252)

    # Max drawdown
    max_drawdown = 0.0
    peak = daily_values[0]
    for v in daily_values:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (peak - v) / peak
            if dd > max_drawdown:
                max_drawdown = dd

    # Trade stats
    executed = [r for r in daily_runs if r.get("executed")]
    signals = [r for r in daily_runs if r.get("action") not in (None, "ERROR")]
    total_trades = len(executed)
    total_signals = len(signals)

    profitable = sum(1 for r in executed if (r.get("pnl") or 0) > 0)
    win_rate = (profitable / total_trades) if total_trades > 0 else None
    ser = (total_trades / total_signals) if total_signals > 0 else None

    # Per-ticker
    ticker_pnl: dict[str, float] = {}
    ticker_trades: dict[str, int] = {}
    for r in executed:
        t = r.get("ticker", "UNKNOWN")
        ticker_pnl[t]    = ticker_pnl.get(t, 0.0)    + (r.get("pnl") or 0.0)
        ticker_trades[t] = ticker_trades.get(t, 0) + 1

    per_ticker = {
        t: {
            "return_contribution": round(pnl / initial_capital, 6),
            "trades": ticker_trades.get(t, 0),
        }
        for t, pnl in ticker_pnl.items()
    }

    return {
        "cumulative_return":        round(cumulative_return, 6),
        "sharpe_ratio":             round(sharpe, 4) if sharpe is not None else None,
        "max_drawdown":             round(-max_drawdown, 6),
        "total_trades":             total_trades,
        "win_rate":                 round(win_rate, 4) if win_rate is not None else None,
        "signal_to_execution_rate": round(ser, 4)      if ser is not None else None,
        "per_ticker":               per_ticker,
    }


def _empty_metrics() -> dict:
    return {
        "cumulative_return": 0.0,
        "sharpe_ratio":             None,
        "max_drawdown":             0.0,
        "total_trades":             0,
        "win_rate":                 None,
        "signal_to_execution_rate": None,
        "per_ticker":               {},
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_metrics.py -v
```
Expected: All 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/backtesting/metrics.py backend/tests/test_metrics.py
git commit -m "feat: add backtest metrics calculator (Sharpe, drawdown, win rate)"
```

---

## Task 5: Backtest Service (Supabase + MongoDB CRUD)

**Files:**
- Create: `backend/services/backtest_service.py`
- Test: `backend/tests/test_backtest_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_backtest_service.py`:

```python
# backend/tests/test_backtest_service.py
from unittest.mock import MagicMock, patch


def _sb_mock():
    m = MagicMock()
    m.table.return_value.insert.return_value.execute.return_value = MagicMock()
    m.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    m.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])
    m.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    m.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    return m


def test_create_job_inserts_row_with_correct_shape():
    sb = _sb_mock()
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import create_job
        job_id = create_job("user_1", ["AAPL", "MSFT"], "2026-01-01", "2026-02-01", "conditional")
    payload = sb.table.return_value.insert.call_args[0][0]
    assert payload["user_id"] == "user_1"
    assert payload["tickers"] == ["AAPL", "MSFT"]
    assert payload["ebc_mode"] == "conditional"
    assert payload["status"] == "queued"
    assert payload["initial_capital"] == 10000.0
    assert "id" in payload
    assert job_id == payload["id"]


def test_list_jobs_returns_data():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[{"id": "abc", "status": "completed"}]
    )
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import list_jobs
        result = list_jobs("user_1")
    assert result == [{"id": "abc", "status": "completed"}]


def test_delete_job_returns_false_when_running():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"status": "running", "mongo_id": None}]
    )
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import delete_job
        result = delete_job("job-1", "user_1")
    assert result is False


def test_delete_job_returns_none_when_not_found():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import delete_job
        result = delete_job("job-1", "user_1")
    assert result is None
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && uv run pytest tests/test_backtest_service.py -v
```
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Create `backend/services/backtest_service.py`**

```python
# backend/services/backtest_service.py
"""
Backtest job CRUD — Supabase metadata + MongoDB full results.

Supabase: backtest_jobs table (lightweight, queryable metadata)
MongoDB:  backtest_results collection (daily_runs, equity_curve, metrics)
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from pymongo import MongoClient

from db.supabase import get_supabase

_mongo_client: MongoClient | None = None


def _get_results_col():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(os.environ["MONGODB_URI"])
    return _mongo_client[os.environ.get("MONGODB_DB_NAME", "atlas")]["backtest_results"]


# ── Job CRUD ──────────────────────────────────────────────────────────────────

def create_job(
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
) -> str:
    job_id = str(uuid.uuid4())
    get_supabase().table("backtest_jobs").insert({
        "id":             job_id,
        "user_id":        user_id,
        "status":         "queued",
        "tickers":        tickers,
        "start_date":     start_date,
        "end_date":       end_date,
        "ebc_mode":       ebc_mode,
        "initial_capital": 10000.0,
        "progress":       0,
    }).execute()
    return job_id


def list_jobs(user_id: str) -> list[dict]:
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def get_job(job_id: str, user_id: str) -> Optional[dict]:
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    job = result.data[0]
    if job.get("mongo_id") and job["status"] in ("completed", "failed"):
        doc = _get_results_col().find_one({"_id": ObjectId(job["mongo_id"])})
        if doc:
            doc["_id"] = str(doc["_id"])
            job["results"] = doc
    return job


def delete_job(job_id: str, user_id: str) -> Optional[bool]:
    """Returns None if not found, False if running, True if deleted."""
    result = (
        get_supabase()
        .table("backtest_jobs")
        .select("status,mongo_id")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    job = result.data[0]
    if job["status"] == "running":
        return False
    if job.get("mongo_id"):
        _get_results_col().delete_one({"_id": ObjectId(job["mongo_id"])})
    get_supabase().table("backtest_jobs").delete().eq("id", job_id).eq("user_id", user_id).execute()
    return True


# ── Status / progress updates ─────────────────────────────────────────────────

def update_job_status(
    job_id: str,
    status: str,
    progress: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    patch: dict = {"status": status}
    if progress is not None:
        patch["progress"] = progress
    if error_message:
        patch["error_message"] = error_message
    if status in ("completed", "failed"):
        patch["completed_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("backtest_jobs").update(patch).eq("id", job_id).execute()


def update_job_metrics(job_id: str, metrics: dict, mongo_id: str) -> None:
    get_supabase().table("backtest_jobs").update({
        "status":                   "completed",
        "mongo_id":                 mongo_id,
        "progress":                 100,
        "total_return":             metrics.get("cumulative_return"),
        "sharpe_ratio":             metrics.get("sharpe_ratio"),
        "max_drawdown":             metrics.get("max_drawdown"),
        "win_rate":                 metrics.get("win_rate"),
        "total_trades":             metrics.get("total_trades"),
        "signal_to_execution_rate": metrics.get("signal_to_execution_rate"),
        "completed_at":             datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


# ── MongoDB helpers ───────────────────────────────────────────────────────────

def create_results_doc(
    job_id: str,
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
) -> str:
    doc = {
        "job_id":         job_id,
        "user_id":        user_id,
        "tickers":        tickers,
        "start_date":     start_date,
        "end_date":       end_date,
        "ebc_mode":       ebc_mode,
        "initial_capital": 10000.0,
        "daily_runs":     [],
        "equity_curve":   [],
        "metrics":        {},
        "created_at":     datetime.now(timezone.utc),
    }
    result = _get_results_col().insert_one(doc)
    return str(result.inserted_id)


def set_mongo_id(job_id: str, mongo_id: str) -> None:
    get_supabase().table("backtest_jobs").update({"mongo_id": mongo_id}).eq("id", job_id).execute()


def append_day_results(
    mongo_id: str,
    day_runs: list[dict],
    equity_point: dict,
) -> None:
    _get_results_col().update_one(
        {"_id": ObjectId(mongo_id)},
        {"$push": {"daily_runs": {"$each": day_runs}, "equity_curve": equity_point}},
    )


def finalize_results(mongo_id: str, metrics: dict) -> None:
    _get_results_col().update_one(
        {"_id": ObjectId(mongo_id)},
        {"$set": {"metrics": metrics, "completed_at": datetime.now(timezone.utc)}},
    )
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && uv run pytest tests/test_backtest_service.py -v
```
Expected: All 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/backtest_service.py backend/tests/test_backtest_service.py
git commit -m "feat: add backtest service (Supabase + MongoDB CRUD)"
```

---

## Task 6: Backtest Runner (Background Task)

**Files:**
- Create: `backend/backtesting/runner.py`

No unit tests for runner (it orchestrates external calls). Integration is verified end-to-end in Task 8.

- [ ] **Step 1: Create `backend/backtesting/runner.py`**

```python
# backend/backtesting/runner.py
"""
Backtest runner — async background task that drives the full backtest loop.

For each trading day × ticker:
  1. Run real pipeline (Gemini calls) with as_of_date constraint
  2. Simulator decides execution
  3. Fetch next-day open for execution price
  4. Append daily run to MongoDB
After all days: compute metrics, finalize.
"""
import asyncio
import logging
from datetime import date as date_cls

import pandas as pd

from agents.data.market import fetch_next_open
from agents.orchestrator import run_pipeline_async
from backtesting.metrics import compute_metrics
from backtesting.simulator import VirtualPortfolio
from services.backtest_service import (
    append_day_results,
    create_results_doc,
    finalize_results,
    set_mongo_id,
    update_job_metrics,
    update_job_status,
)

logger = logging.getLogger(__name__)


def _trading_days(start: date_cls, end: date_cls) -> list[str]:
    """Business days (Mon–Fri) between start and end inclusive."""
    return [d.strftime("%Y-%m-%d") for d in pd.bdate_range(start=start, end=end)]


async def run_backtest_job(
    job_id: str,
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
) -> None:
    update_job_status(job_id, "running", progress=0)
    mongo_id = create_results_doc(job_id, user_id, tickers, start_date, end_date, ebc_mode)
    set_mongo_id(job_id, mongo_id)

    trading_days = _trading_days(date_cls.fromisoformat(start_date), date_cls.fromisoformat(end_date))
    if not trading_days:
        update_job_status(job_id, "failed", error_message="No trading days in range")
        return

    last_day = trading_days[-1]
    total_runs = len(trading_days) * len(tickers)
    runs_completed = 0
    portfolio = VirtualPortfolio(initial_capital=10000.0)
    all_daily_runs: list[dict] = []
    errors = 0

    for trading_day in trading_days:
        is_last = trading_day == last_day
        day_runs: list[dict] = []

        for ticker in tickers:
            run_record: dict
            try:
                signal = await run_pipeline_async(
                    ticker=ticker,
                    boundary_mode=ebc_mode,
                    user_id=user_id,
                    as_of_date=trading_day,
                )
                exec_price = (
                    None
                    if is_last
                    else await asyncio.to_thread(fetch_next_open, ticker, trading_day)
                )
                sim = portfolio.process(
                    date=trading_day,
                    ticker=ticker,
                    action=signal.action,
                    confidence=signal.confidence,
                    ebc_mode=ebc_mode,
                    execution_price=exec_price,
                    is_last_day=is_last,
                )
                run_record = {
                    "date":           trading_day,
                    "ticker":         ticker,
                    "action":         signal.action,
                    "confidence":     signal.confidence,
                    "reasoning":      signal.reasoning,
                    "executed":       sim.get("executed", False),
                    "simulated_price": exec_price,
                    "shares":         sim.get("shares"),
                    "pnl":            sim.get("pnl"),
                    "skipped_reason": sim.get("skipped_reason") or sim.get("reason"),
                    "trace_id":       signal.trace_id,
                }
            except Exception as exc:
                logger.warning("Pipeline error %s %s: %s", ticker, trading_day, exc)
                errors += 1
                run_record = {
                    "date":     trading_day,
                    "ticker":   ticker,
                    "action":   "ERROR",
                    "error":    str(exc),
                    "executed": False,
                }

            day_runs.append(run_record)
            runs_completed += 1

        # Mark-to-market for equity curve after all tickers for this day
        current_prices = {
            r["ticker"]: r["simulated_price"]
            for r in day_runs
            if r.get("simulated_price")
        }
        total_value = round(portfolio.portfolio_value(current_prices), 2)
        for r in day_runs:
            r["portfolio_value_after"] = total_value

        all_daily_runs.extend(day_runs)
        append_day_results(mongo_id, day_runs, {"date": trading_day, "value": total_value})
        progress = int((runs_completed / total_runs) * 100)
        update_job_status(job_id, "running", progress=progress)

    # Fail if majority of runs errored
    if total_runs > 0 and errors / total_runs > 0.5:
        update_job_status(job_id, "failed", error_message=f"{errors}/{total_runs} pipeline calls failed")
        return

    # Close open positions at last known prices
    if portfolio.positions:
        last_prices: dict[str, float] = {}
        for r in reversed(all_daily_runs):
            t = r.get("ticker")
            if t and t not in last_prices and r.get("simulated_price"):
                last_prices[t] = r["simulated_price"]
        portfolio.mark_to_market_positions(last_prices)

    # Compute and persist metrics.
    # Dict dedup is intentional: all tickers for a day share the same portfolio_value_after
    # (total portfolio value after all tickers processed), so we want exactly one value per day.
    daily_values = list(
        {r["date"]: r["portfolio_value_after"] for r in all_daily_runs if r.get("portfolio_value_after")}.values()
    )
    metrics = compute_metrics(daily_values, 10000.0, all_daily_runs)
    finalize_results(mongo_id, metrics)
    update_job_metrics(job_id, metrics, mongo_id)
```

- [ ] **Step 2: Commit**

```bash
git add backend/backtesting/runner.py
git commit -m "feat: add backtest runner background task"
```

---

## Task 7: API Routes + Register Router

**Files:**
- Create: `backend/api/routes/backtest.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_backtest_routes.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_backtest_routes.py`:

```python
# backend/tests/test_backtest_routes.py
"""
Route tests use FastAPI dependency_overrides to bypass Clerk JWT auth.
This is the correct pattern — patching ASGI middleware directly is fragile.
"""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    from api.dependencies import get_current_user
    app.dependency_overrides[get_current_user] = lambda: "user_test"
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_backtest_returns_job_id(client):
    with patch("api.routes.backtest.create_job", return_value="job-123"), \
         patch("api.routes.backtest.list_jobs", return_value=[]), \
         patch("api.routes.backtest.run_backtest_job"):
        resp = client.post("/v1/backtest", json={
            "tickers": ["AAPL"],
            "start_date": "2025-01-01",
            "end_date": "2025-02-01",
            "ebc_mode": "conditional",
        })
    assert resp.status_code == 200
    assert resp.json()["job_id"] == "job-123"


def test_create_backtest_rejects_future_end_date(client):
    resp = client.post("/v1/backtest", json={
        "tickers": ["AAPL"],
        "start_date": "2026-01-01",
        "end_date": "2099-12-31",
        "ebc_mode": "conditional",
    })
    assert resp.status_code == 422


def test_delete_running_job_returns_409(client):
    with patch("api.routes.backtest.delete_job", return_value=False):
        resp = client.delete("/v1/backtest/job-123")
    assert resp.status_code == 409


def test_delete_unknown_job_returns_404(client):
    with patch("api.routes.backtest.delete_job", return_value=None):
        resp = client.delete("/v1/backtest/job-999")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd backend && uv run pytest tests/test_backtest_routes.py -v
```

- [ ] **Step 3: Create `backend/api/routes/backtest.py`**

```python
# backend/api/routes/backtest.py
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator

from api.dependencies import get_current_user
from backtesting.runner import run_backtest_job
from services.backtest_service import create_job, delete_job, get_job, list_jobs

router = APIRouter(prefix="/v1/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    tickers: list[str]
    start_date: date
    end_date: date
    ebc_mode: str

    @field_validator("tickers")
    @classmethod
    def validate_tickers(cls, v: list[str]) -> list[str]:
        if not 1 <= len(v) <= 10:
            raise ValueError("tickers must be 1–10 items")
        return [t.strip().upper() for t in v]

    @field_validator("ebc_mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("advisory", "conditional", "autonomous"):
            raise ValueError("ebc_mode must be advisory, conditional, or autonomous")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> "BacktestRequest":
        today = date.today()
        if self.end_date >= today - timedelta(days=1):
            raise ValueError("end_date must be at least 2 days in the past")
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if (self.end_date - self.start_date).days > 90:
            raise ValueError("Date range cannot exceed 90 days")
        return self


@router.post("")
async def create_backtest(
    req: BacktestRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
):
    jobs = list_jobs(user_id)
    if any(j["status"] == "running" for j in jobs):
        raise HTTPException(
            status_code=429,
            detail="You already have a backtest running. Please wait for it to complete.",
        )
    job_id = create_job(
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
    )
    background_tasks.add_task(
        run_backtest_job,
        job_id=job_id,
        user_id=user_id,
        tickers=req.tickers,
        start_date=req.start_date.isoformat(),
        end_date=req.end_date.isoformat(),
        ebc_mode=req.ebc_mode,
    )
    return {"job_id": job_id, "status": "queued"}


@router.get("")
def list_backtest_jobs(user_id: str = Depends(get_current_user)):
    return list_jobs(user_id)


@router.get("/{job_id}")
def get_backtest_job(job_id: str, user_id: str = Depends(get_current_user)):
    job = get_job(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}")
def delete_backtest_job(job_id: str, user_id: str = Depends(get_current_user)):
    result = delete_job(job_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if result is False:
        raise HTTPException(status_code=409, detail="Cannot delete a running job.")
    return {"deleted": True}
```

- [ ] **Step 4: Register router in `backend/main.py`**

Add to imports and router registration:

```python
from api.routes import signals, portfolio, trades, pipeline, webhooks, profile, \
    scheduler as scheduler_router, broker as broker_router, backtest as backtest_router
```

And add after `app.include_router(broker_router.router)`:

```python
app.include_router(backtest_router.router)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && uv run pytest tests/test_backtest_routes.py -v
```
Expected: All tests relating to validation and delete behaviour pass.

- [ ] **Step 6: Smoke test locally**

```bash
cd backend && uv run uvicorn main:app --reload
# In another terminal:
curl http://localhost:8000/openapi.json | python3 -m json.tool | grep backtest
```
Expected: `/v1/backtest` routes appear in the spec.

- [ ] **Step 7: Commit**

```bash
git add backend/api/routes/backtest.py backend/main.py backend/tests/test_backtest_routes.py
git commit -m "feat: add backtest API routes (POST/GET/DELETE /v1/backtest)"
```

---

## Task 8: Frontend — Backtest Tab

**Files:**
- Create: `frontend/app/dashboard/BacktestTab.tsx`
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Create `frontend/app/dashboard/BacktestTab.tsx`**

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type JobStatus = "queued" | "running" | "completed" | "failed";

type BacktestJob = {
  id: string;
  status: JobStatus;
  tickers: string[];
  start_date: string;
  end_date: string;
  ebc_mode: string;
  progress: number;
  total_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  total_trades: number | null;
  signal_to_execution_rate: number | null;
  created_at: string;
  completed_at: string | null;
  results?: BacktestResults;
};

type BacktestResults = {
  daily_runs: DailyRun[];
  equity_curve: { date: string; value: number }[];
  metrics: Record<string, unknown>;
};

type DailyRun = {
  date: string;
  ticker: string;
  action: string;
  confidence: number;
  executed: boolean;
  simulated_price: number | null;
  pnl: number | null;
  skipped_reason: string | null;
  trace_id: string | null;
};

type View = "list" | "new" | "detail";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toFixed(decimals);

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(2)}%`;

const modeColor: Record<string, string> = {
  advisory:    "var(--dim)",
  conditional: "var(--hold)",
  autonomous:  "var(--bull)",
};

const statusColor: Record<JobStatus, string> = {
  queued:    "var(--dim)",
  running:   "var(--hold)",
  completed: "var(--bull)",
  failed:    "var(--bear)",
};

function tradingDayEstimate(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  let days = 0, cur = new Date(s);
  while (cur <= e) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Main component ────────────────────────────────────────────────────────────

export function BacktestTab() {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [jobs, setJobs] = useState<BacktestJob[]>([]);
  const [selected, setSelected] = useState<BacktestJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);

  async function loadJobs() {
    const res = await fetchWithAuth(`${API}/v1/backtest`);
    if (!res) { router.push("/login"); return; }
    if (res.ok) setJobs(await res.json());
  }

  useEffect(() => {
    loadJobs().finally(() => setLoadingJobs(false));
  }, []);

  // Poll running jobs every 5s
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasRunning) return;
    const id = setInterval(loadJobs, 5000);
    return () => clearInterval(id);
  }, [jobs]);

  async function openDetail(job: BacktestJob) {
    const res = await fetchWithAuth(`${API}/v1/backtest/${job.id}`);
    if (!res) return;
    setSelected(await res.json());
    setView("detail");
  }

  if (view === "new") return <NewBacktestForm onBack={() => setView("list")} onCreated={() => { setView("list"); loadJobs(); }} />;
  if (view === "detail" && selected) return <ResultsDetail job={selected} onBack={() => setView("list")} />;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center justify-between">
        <span style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)" }}>
          BACKTESTS — {jobs.length} RUNS
        </span>
        <button
          onClick={() => setView("new")}
          style={{
            background: "var(--brand)", color: "#fff",
            fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 13,
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer",
          }}
        >
          + New Backtest
        </button>
      </div>

      {loadingJobs && (
        <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "32px 0" }}>
          Loading…
        </div>
      )}

      {!loadingJobs && jobs.length === 0 && (
        <div style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)", textAlign: "center", padding: "32px 0" }}>
          No backtests yet. Click "+ New Backtest" to run your first one.
        </div>
      )}

      {jobs.map((job) => (
        <div
          key={job.id}
          onClick={() => job.status === "completed" && openDetail(job)}
          style={{
            background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10,
            padding: "16px 18px", boxShadow: "var(--card-shadow)",
            cursor: job.status === "completed" ? "pointer" : "default",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                {job.tickers.join(" · ")}
              </span>
              <span style={{ marginLeft: 10, fontFamily: "var(--font-nunito)", fontSize: 12, color: modeColor[job.ebc_mode] }}>
                {job.ebc_mode}
              </span>
            </div>
            <span style={{ fontSize: 11, fontFamily: "var(--font-jb)", color: statusColor[job.status], padding: "2px 8px", borderRadius: 4, background: `${statusColor[job.status]}18`, border: `1px solid ${statusColor[job.status]}40` }}>
              {job.status}
            </span>
          </div>

          <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", marginBottom: 10 }}>
            {job.start_date} → {job.end_date}
          </div>

          {(job.status === "running" || job.status === "queued") && (
            <div style={{ background: "var(--elevated)", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${job.progress}%`, background: "var(--hold)", height: "100%", transition: "width 0.5s" }} />
            </div>
          )}

          {job.status === "completed" && (
            <div className="grid grid-cols-3 gap-2 text-center mt-1">
              {[
                { label: "RETURN",   value: pct(job.total_return) },
                { label: "SHARPE",   value: fmt(job.sharpe_ratio) },
                { label: "MAX DD",   value: pct(job.max_drawdown) },
              ].map((m) => (
                <div key={m.label}>
                  <div style={{ color: "var(--ghost)", fontSize: 10, fontFamily: "var(--font-jb)" }}>{m.label}</div>
                  <div style={{ color: "var(--ink)", fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {job.status === "failed" && job.results && (
            <div style={{ color: "var(--bear)", fontSize: 12, fontFamily: "var(--font-nunito)" }}>Failed</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── New Backtest Form ─────────────────────────────────────────────────────────

function NewBacktestForm({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [tickers, setTickers] = useState("AAPL, MSFT, TSLA");
  const [startDate, setStartDate] = useState("2025-10-01");
  const [endDate, setEndDate] = useState("2025-12-01");
  const [mode, setMode] = useState("conditional");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tickerList = tickers.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const days = tradingDayEstimate(startDate, endDate);
  const calls = days * tickerList.length;
  const costEst = (calls * 0.001).toFixed(2);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetchWithAuth(`${API}/v1/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: tickerList, start_date: startDate, end_date: endDate, ebc_mode: mode }),
    });
    if (!res) { router.push("/login"); return; }
    if (!res.ok) {
      const data = await res.json();
      setError(data.detail ?? "Failed to start backtest");
      setSubmitting(false);
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13 }}>← Back</button>
        <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>NEW BACKTEST</span>
      </div>

      {[
        { label: "TICKERS", hint: "comma-separated, e.g. AAPL, MSFT, TSLA", node: <input value={tickers} onChange={(e) => setTickers(e.target.value)} style={inputStyle} /> },
        { label: "START DATE", node: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} /> },
        { label: "END DATE",   node: <input type="date" value={endDate}   onChange={(e) => setEndDate(e.target.value)}   style={inputStyle} /> },
      ].map(({ label, hint, node }) => (
        <div key={label}>
          <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 6 }}>{label}{hint && <span style={{ marginLeft: 8, opacity: 0.6 }}>{hint}</span>}</div>
          {node}
        </div>
      ))}

      <div>
        <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 8 }}>EBC MODE</div>
        <div className="flex gap-2">
          {(["advisory", "conditional", "autonomous"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 6, textAlign: "center",
              fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: mode === m ? 700 : 500,
              border: `1px solid ${mode === m ? modeColor[m] : "var(--line)"}`,
              color: mode === m ? modeColor[m] : "var(--ghost)",
              background: mode === m ? `${modeColor[m]}10` : "transparent",
              cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--elevated)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)" }}>
        ~{calls} AI calls · approx. ${costEst} <span style={{ color: "var(--ghost)", fontSize: 11 }}>(estimate)</span>
      </div>

      {error && <div style={{ color: "var(--bear)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{error}</div>}

      <button type="submit" disabled={submitting} style={{
        background: submitting ? "var(--line)" : "var(--brand)", color: "#fff",
        fontFamily: "var(--font-nunito)", fontWeight: 700, fontSize: 15,
        padding: "12px 0", borderRadius: 8, border: "none", cursor: submitting ? "not-allowed" : "pointer",
      }}>
        {submitting ? "Starting…" : "Run Backtest"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)",
  color: "var(--ink)", fontFamily: "var(--font-nunito)", fontSize: 14,
  boxSizing: "border-box",
};

// ── Results Detail ────────────────────────────────────────────────────────────

function ResultsDetail({ job, onBack }: { job: BacktestJob; onBack: () => void }) {
  const metrics = job.results?.metrics as Record<string, unknown> | undefined;
  const perTicker = (metrics?.per_ticker ?? {}) as Record<string, { return_contribution: number; trades: number }>;
  const dailyRuns = job.results?.daily_runs ?? [];

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ghost)", fontSize: 13 }}>← Back</button>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{job.tickers.join(" · ")}</span>
        <span style={{ fontSize: 11, color: modeColor[job.ebc_mode], fontFamily: "var(--font-nunito)" }}>{job.ebc_mode}</span>
      </div>

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[
          { label: "RETURN",      value: pct(job.total_return) },
          { label: "SHARPE",      value: fmt(job.sharpe_ratio) },
          { label: "MAX DD",      value: pct(job.max_drawdown) },
          { label: "WIN RATE",    value: pct(job.win_rate) },
          { label: "TRADES",      value: String(job.total_trades ?? "—") },
          { label: "SIG→EXEC",    value: pct(job.signal_to_execution_rate) },
        ].map((m) => (
          <div key={m.label} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-jb)", fontSize: 10, color: "var(--ghost)", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Per-ticker breakdown */}
      {Object.keys(perTicker).length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>PER TICKER</span>
          </div>
          {Object.entries(perTicker).map(([ticker, data]) => (
            <div key={ticker} className="flex items-center justify-between" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink)" }}>{ticker}</span>
              <span style={{ fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--dim)" }}>{data.trades} trades</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: data.return_contribution >= 0 ? "var(--bull)" : "var(--bear)", fontWeight: 600 }}>
                {pct(data.return_contribution)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Daily runs */}
      {dailyRuns.length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--font-jb)", fontSize: 11, color: "var(--ghost)" }}>DAILY RUNS — {dailyRuns.length}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {dailyRuns.map((r, i) => (
              <div key={i} className="flex items-center gap-3" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", opacity: r.executed ? 1 : 0.5 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ghost)", minWidth: 80 }}>{r.date}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: "var(--ink)", minWidth: 50 }}>{r.ticker}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                  color: r.action === "BUY" ? "var(--bull)" : r.action === "SELL" ? "var(--bear)" : "var(--hold)",
                  background: r.action === "BUY" ? "var(--bull-bg)" : r.action === "SELL" ? "var(--bear-bg)" : "var(--hold-bg)",
                }}>{r.action}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--dim)" }}>{Math.round(r.confidence * 100)}%</span>
                <span style={{ fontFamily: "var(--font-nunito)", fontSize: 11, color: r.executed ? "var(--bull)" : "var(--ghost)", marginLeft: "auto" }}>
                  {r.executed ? "✓ executed" : r.skipped_reason ?? "skipped"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Backtest tab to `frontend/app/dashboard/page.tsx`**

Find the `Tab` type definition and add `"backtest"`:

```typescript
type Tab = "overview" | "signals" | "positions" | "settings" | "backtest";
```

Add the import at the top of the file:

```typescript
import { BacktestTab } from "./BacktestTab";
```

Find the tab navigation array (the one rendering tab buttons with labels like "Overview", "Signals", etc.) and add a Backtest entry matching the existing pattern.

Find the tab content render (the `if (tab === "settings")` or similar switch/conditional) and add:

```typescript
{tab === "backtest" && <BacktestTab />}
```

- [ ] **Step 3: Build check**

```bash
cd frontend && npm run build
```
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Dev server smoke test**

```bash
cd frontend && npm run dev
```
Open `http://localhost:3000/dashboard` → verify Backtest tab appears → click "+ New Backtest" → form loads with tickers/dates/mode/cost estimate.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/BacktestTab.tsx frontend/app/dashboard/page.tsx
git commit -m "feat: add Backtest tab to dashboard (job list, new form, results detail)"
```

---

## Task 9: Final Integration Verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && uv run pytest tests/ -v \
  --ignore=tests/test_signals_integration.py \
  -k "not integration"
```
Expected: All tests PASS, no regressions.

- [ ] **Step 2: Deploy to UAT**

```bash
git push origin uat
```
Render and Vercel will auto-deploy. Monitor Render logs for startup errors.

- [ ] **Step 3: Verify new endpoints in UAT**

```bash
curl https://atlas-broker-backend-uat.onrender.com/openapi.json | python3 -c "
import json,sys
spec=json.load(sys.stdin)
bt=[p for p in spec['paths'] if 'backtest' in p]
print('Backtest routes:', bt)
"
```
Expected: `['/v1/backtest', '/v1/backtest/{job_id}']`

- [ ] **Step 4: End-to-end test via dashboard**

1. Open `https://atlas-broker-uat.vercel.app/dashboard`
2. Navigate to Backtest tab
3. Create a job: tickers=`AAPL`, start=`2025-10-01`, end=`2025-10-15`, mode=`advisory`
4. Confirm job appears with `running` status and progress bar updates
5. Wait for completion → metrics appear (advisory: total_trades=0, signal_to_execution_rate shows N/A)
6. Click job → results detail view shows daily runs

- [ ] **Step 5: Final commit + tag**

```bash
git add -A
git commit -m "chore: backtesting engine complete - all tasks done"
```
