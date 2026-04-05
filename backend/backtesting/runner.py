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

# In-process cancellation flags. Set by the cancel endpoint; checked between days.
_cancellation_flags: set[str] = set()

def request_cancellation(job_id: str) -> None:
    """Signal the running job to stop after the current day finishes."""
    _cancellation_flags.add(job_id)


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
    philosophy_mode: str = "balanced",
    confidence_threshold: float | None = None,
) -> None:
    update_job_status(job_id, "running", progress=0)
    mongo_id = create_results_doc(
        job_id, user_id, tickers, start_date, end_date, ebc_mode,
        philosophy_mode=philosophy_mode,
        confidence_threshold=confidence_threshold,
    )
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
        if job_id in _cancellation_flags:
            _cancellation_flags.discard(job_id)
            update_job_status(job_id, "cancelled")
            return
        is_last = trading_day == last_day
        day_runs: list[dict] = []

        logger.debug(
            "[Backtest] Day %s | cash=$%.2f | positions=%s",
            trading_day, portfolio.cash, list(portfolio.positions.keys()),
        )

        # Snapshot virtual portfolio state for this day's pipeline calls
        virtual_positions = {
            t: {"shares": pos.shares, "avg_cost": pos.avg_cost}
            for t, pos in portfolio.positions.items()
        }
        virtual_account = {
            "portfolio_value": portfolio.portfolio_value({}),
            "buying_power": portfolio.cash,
            "equity": portfolio.portfolio_value({}),
        }

        for ticker in tickers:
            run_record: dict
            try:
                signal = await run_pipeline_async(
                    ticker=ticker,
                    boundary_mode=ebc_mode,
                    user_id=user_id,
                    as_of_date=trading_day,
                    philosophy_mode=philosophy_mode,
                    current_positions=virtual_positions,
                    account_info=virtual_account,
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
                    confidence_threshold_override=confidence_threshold,
                    position_value_override=signal.risk.get("position_value"),
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
        append_day_results(mongo_id, day_runs, {"date": trading_day, "value": total_value, "cash": round(portfolio.cash, 2)})
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
