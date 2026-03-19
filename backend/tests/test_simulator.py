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
