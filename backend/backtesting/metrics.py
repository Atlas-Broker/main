"""Aggregate metrics for a completed backtest run."""
import math


def compute_metrics(
    daily_values: list[float],
    initial_capital: float,
    daily_runs: list[dict],
) -> dict:
    """
    Compute comprehensive backtest metrics.

    Args:
        daily_values: Portfolio value at end of each day
        initial_capital: Starting capital
        daily_runs: List of trade execution records

    Returns:
        Dictionary with keys:
        - cumulative_return: (final_value - initial) / initial
        - sharpe_ratio: Risk-adjusted return (252 annualized), or None if std=0
        - max_drawdown: Negative value (e.g., -0.18 for 18% drawdown)
        - total_trades: Count of executed trades
        - win_rate: Fraction of profitable trades, or None if no trades
        - signal_to_execution_rate: Executed / signals, or None if no signals
        - per_ticker: Dict mapping ticker → {return_contribution, trades}
    """
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

    # CAGR (Compound Annual Growth Rate)
    cagr = None
    if len(daily_values) >= 2 and initial_capital > 0 and final_value > 0:
        years = len(daily_values) / 252.0
        cagr = (final_value / initial_capital) ** (1.0 / years) - 1

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

    # Calmar ratio = CAGR / max_drawdown
    calmar = None
    if cagr is not None and max_drawdown > 0:
        calmar = cagr / max_drawdown

    # Trade stats
    executed = [r for r in daily_runs if r.get("executed")]
    # Signals: all runs with a valid action. The runner always attaches the pipeline's
    # signal.action to every run_record (even non-executed ones), so this correctly
    # counts all signals regardless of whether they were executed.
    signals = [r for r in daily_runs if r.get("action") not in (None, "ERROR")]
    total_trades = len(executed)
    total_signals = len(signals)

    closed_trades = [r for r in executed if r.get("pnl") is not None]
    profitable = sum(1 for r in closed_trades if r["pnl"] > 0)
    win_rate = (profitable / len(closed_trades)) if closed_trades else None
    ser = (total_trades / total_signals) if total_signals > 0 else None

    # Profit factor = gross profit / gross loss
    gross_profit = sum(r["pnl"] for r in closed_trades if r["pnl"] > 0)
    gross_loss = sum(abs(r["pnl"]) for r in closed_trades if r["pnl"] < 0)
    profit_factor = round(gross_profit / gross_loss, 4) if gross_loss > 0 else None

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
        "cagr":                     round(cagr, 6) if cagr is not None else None,
        "calmar_ratio":             round(calmar, 4) if calmar is not None else None,
        "profit_factor":            profit_factor,
    }


def _empty_metrics() -> dict:
    """Return default metrics for empty backtest."""
    return {
        "cumulative_return":        0.0,
        "sharpe_ratio":             None,
        "max_drawdown":             0.0,
        "total_trades":             0,
        "win_rate":                 None,
        "signal_to_execution_rate": None,
        "per_ticker":               {},
        "cagr":                     None,
        "calmar_ratio":             None,
        "profit_factor":            None,
    }
