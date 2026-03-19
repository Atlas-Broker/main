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
    assert result["win_rate"] == pytest.approx(2 / 3, rel=1e-3)


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
