"""
Durable backtest function — runs via Inngest for reliable, step-by-step execution.

Each trading day is an independent step: if a step fails (rate limit, transient
error, Render restart), Inngest retries just that step. All prior days are
memoized and never re-executed.

Rate limiting strategy:
  - RetryAfterError on Gemini 429s: tells Inngest to wait before retrying the step
  - Throttle: caps new function invocations to prevent burst-triggered 429s
"""
import asyncio
import datetime
import logging
from typing import Any

import inngest
import pandas as pd
from dotenv import load_dotenv

load_dotenv()  # Ensure env vars are loaded even when called from step context

from agents.data.market import fetch_next_open
from agents.orchestrator import run_pipeline_async
from backtesting.metrics import compute_metrics
from backtesting.simulator import Position, VirtualPortfolio
from inngest_client import inngest_client
from services.backtest_service import (
    _get_results_col,
    append_day_results,
    create_results_doc,
    finalize_results,
    get_checkpoint,
    save_checkpoint,
    set_mongo_id,
    update_job_metrics,
    update_job_status,
)
from db.supabase import get_supabase, reset_supabase

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _trading_days(start_date: str, end_date: str) -> list[str]:
    from datetime import date as date_cls
    return [
        d.strftime("%Y-%m-%d")
        for d in pd.bdate_range(
            start=date_cls.fromisoformat(start_date),
            end=date_cls.fromisoformat(end_date),
        )
    ]


def _restore_portfolio(checkpoint: dict | None, initial_capital: float = 100_000.0) -> VirtualPortfolio:
    portfolio = VirtualPortfolio(initial_capital=initial_capital)
    if not checkpoint:
        return portfolio
    portfolio.cash = checkpoint["cash"]
    for ticker, pos in checkpoint.get("positions", {}).items():
        portfolio.positions[ticker] = Position(
            ticker=ticker,
            shares=pos["shares"],
            avg_cost=pos["avg_cost"],
            entry_date=pos["entry_date"],
        )
    return portfolio


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "quota" in msg or "rate" in msg or "resource_exhausted" in str(type(exc).__name__).lower()


# ── Step implementations ──────────────────────────────────────────────────────

def _initialize(
    job_id: str,
    user_id: str,
    tickers: list[str],
    start_date: str,
    end_date: str,
    ebc_mode: str,
    philosophy_mode: str,
    confidence_threshold: float | None,
    mongo_id: str | None,
    initial_capital: float = 100_000.0,
) -> dict[str, Any]:
    """
    Initialize a new run or resume from checkpoint.
    Returns trading_days (remaining) and mongo_id.
    """
    all_days = _trading_days(start_date, end_date)
    if not all_days:
        update_job_status(job_id, "failed", error_message="No trading days in range")
        raise inngest.NonRetriableError("No trading days in range")

    if mongo_id:
        # Resume: skip already-completed days
        checkpoint = get_checkpoint(mongo_id)
        last = checkpoint["last_completed_day"] if checkpoint else None
        remaining = [d for d in all_days if d > last] if last else all_days
        update_job_status(job_id, "running")
        return {"trading_days": remaining, "mongo_id": mongo_id}

    # New job
    new_mongo_id = create_results_doc(
        job_id, user_id, tickers, start_date, end_date, ebc_mode,
        philosophy_mode=philosophy_mode,
        confidence_threshold=confidence_threshold,
        initial_capital=initial_capital,
    )
    set_mongo_id(job_id, new_mongo_id)
    update_job_status(job_id, "running", progress=0)
    return {"trading_days": all_days, "mongo_id": new_mongo_id}


async def _run_trading_day(
    job_id: str,
    mongo_id: str,
    day: str,
    is_last: bool,
    day_index: int,
    total_days: int,
    user_id: str,
    tickers: list[str],
    ebc_mode: str,
    philosophy_mode: str,
    confidence_threshold: float | None,
    initial_capital: float = 100_000.0,
) -> dict[str, Any]:
    """Process all tickers for one trading day. Returns {cancelled, errors}."""
    # Bail if cancelled via the UI — tolerate transient Supabase connection errors
    try:
        status_result = (
            get_supabase()
            .table("backtest_jobs")
            .select("status")
            .eq("id", job_id)
            .execute()
        )
        if status_result.data and status_result.data[0]["status"] == "cancelled":
            return {"cancelled": True}
    except Exception as exc:
        logger.warning("Could not check cancellation status for job %s: %s — continuing", job_id, exc)
        reset_supabase()  # Force fresh client on next call

    portfolio = _restore_portfolio(get_checkpoint(mongo_id), initial_capital=initial_capital)
    virtual_positions = {
        t: {"shares": pos.shares, "avg_cost": pos.avg_cost}
        for t, pos in portfolio.positions.items()
    }
    virtual_account = {
        "portfolio_value": portfolio.portfolio_value({}),
        "buying_power": portfolio.cash,
        "equity": portfolio.portfolio_value({}),
    }

    day_runs: list[dict] = []
    errors = 0

    for ticker in tickers:
        try:
            signal = await run_pipeline_async(
                ticker=ticker,
                boundary_mode=ebc_mode,
                user_id=user_id,
                as_of_date=day,
                philosophy_mode=philosophy_mode,
                current_positions=virtual_positions,
                account_info=virtual_account,
            )
            exec_price = (
                None if is_last
                else await asyncio.to_thread(fetch_next_open, ticker, day)
            )
            sim = portfolio.process(
                date=day,
                ticker=ticker,
                action=signal.action,
                confidence=signal.confidence,
                ebc_mode=ebc_mode,
                execution_price=exec_price,
                is_last_day=is_last,
                confidence_threshold_override=confidence_threshold,
                position_value_override=signal.risk.get("position_value"),
            )
            day_runs.append({
                "date":            day,
                "ticker":          ticker,
                "action":          signal.action,
                "confidence":      signal.confidence,
                "reasoning":       signal.reasoning,
                "executed":        sim.get("executed", False),
                "simulated_price": exec_price,
                "shares":          sim.get("shares"),
                "pnl":             sim.get("pnl"),
                "skipped_reason":  sim.get("skipped_reason") or sim.get("reason"),
                "trace_id":        signal.trace_id,
            })
        except Exception as exc:
            # Surface rate limit errors to Inngest so it backs off before retrying
            if _is_rate_limit_error(exc):
                logger.warning("Rate limit hit on %s %s — signalling Inngest to retry after 60s", ticker, day)
                raise inngest.RetryAfterError(f"Gemini rate limit on {ticker}/{day}", 60)
            logger.warning("Pipeline error %s %s: %s", ticker, day, exc)
            errors += 1
            day_runs.append({
                "date": day, "ticker": ticker,
                "action": "ERROR", "error": str(exc), "executed": False,
            })

    # Mark-to-market equity curve
    current_prices = {r["ticker"]: r["simulated_price"] for r in day_runs if r.get("simulated_price")}
    total_value = round(portfolio.portfolio_value(current_prices), 2)
    for r in day_runs:
        r["portfolio_value_after"] = total_value

    # Per-ticker position values for stacked chart breakdown
    positions_value = {
        ticker: round(pos.shares * current_prices.get(ticker, pos.avg_cost), 2)
        for ticker, pos in portfolio.positions.items()
    }

    append_day_results(
        mongo_id, day_runs,
        {
            "date": day,
            "value": total_value,
            "cash": round(portfolio.cash, 2),
            "positions": positions_value,
        },
    )
    save_checkpoint(
        mongo_id,
        last_completed_day=day,
        cash=portfolio.cash,
        positions={
            t: {"shares": p.shares, "avg_cost": p.avg_cost, "entry_date": p.entry_date}
            for t, p in portfolio.positions.items()
        },
    )

    progress = int(((day_index + 1) / total_days) * 100)
    update_job_status(job_id, "running", progress=progress)

    return {"cancelled": False, "errors": errors, "progress": progress}


def _finalize(job_id: str, mongo_id: str) -> dict[str, Any]:
    """Close open positions, compute metrics, mark job completed."""
    from bson import ObjectId
    doc = _get_results_col().find_one({"_id": ObjectId(mongo_id)})
    if not doc:
        raise inngest.NonRetriableError(f"Results doc {mongo_id} not found")

    portfolio = _restore_portfolio(doc.get("checkpoint"), initial_capital=doc.get("initial_capital", 100_000.0))
    if portfolio.positions:
        last_prices: dict[str, float] = {}
        for r in reversed(doc.get("daily_runs", [])):
            t = r.get("ticker")
            if t and t not in last_prices and r.get("simulated_price"):
                last_prices[t] = r["simulated_price"]
        portfolio.mark_to_market_positions(last_prices)

    daily_values = [pt["value"] for pt in doc.get("equity_curve", []) if pt.get("value")]
    metrics = compute_metrics(daily_values, doc.get("initial_capital", 10000.0), doc.get("daily_runs", []))
    finalize_results(mongo_id, metrics)
    update_job_metrics(job_id, metrics, mongo_id)
    return {"status": "completed"}


# ── Inngest function ──────────────────────────────────────────────────────────

@inngest_client.create_function(
    fn_id="run-backtest",
    trigger=inngest.TriggerEvent(event="atlas/backtest.run"),
    retries=3,
    # Throttle limits how many new runs start per minute, reducing Gemini burst 429s.
    throttle=inngest.Throttle(limit=20, period=datetime.timedelta(minutes=1)),
)
async def run_backtest_fn(ctx: inngest.Context) -> dict[str, Any]:
    step = ctx.step
    data = ctx.event.data
    job_id: str            = data["job_id"]
    user_id: str           = data["user_id"]
    tickers: list[str]     = data["tickers"]
    start_date: str        = data["start_date"]
    end_date: str          = data["end_date"]
    ebc_mode: str          = data["ebc_mode"]
    philosophy_mode: str   = data.get("philosophy_mode", "balanced")
    confidence_threshold   = data.get("confidence_threshold")
    initial_capital: float = float(data.get("initial_capital", 100_000.0))
    existing_mongo_id      = data.get("mongo_id")  # present on resume

    # ── Step 1: Initialize ─────────────────────────────────────────────────
    init = await step.run(
        "initialize",
        lambda: _initialize(
            job_id, user_id, tickers, start_date, end_date,
            ebc_mode, philosophy_mode, confidence_threshold, existing_mongo_id,
            initial_capital,
        ),
    )
    trading_days: list[str] = init["trading_days"]
    mongo_id: str           = init["mongo_id"]

    # ── Step 2: One step per trading day ───────────────────────────────────
    total = len(trading_days)
    for i, day in enumerate(trading_days):
        is_last = i == total - 1

        # Capture loop vars by value to avoid Python closure issues.
        # Pass make_day_handler (the function) — NOT make_day_handler() (a coroutine).
        # step.run() requires a callable; calling it here would return a coroutine object.
        async def make_day_handler(
            _job_id=job_id, _mongo_id=mongo_id, _day=day, _is_last=is_last,
            _i=i, _total=total, _user_id=user_id, _tickers=tickers,
            _ebc_mode=ebc_mode, _philosophy_mode=philosophy_mode,
            _ct=confidence_threshold, _ic=initial_capital,
        ):
            return await _run_trading_day(
                _job_id, _mongo_id, _day, _is_last, _i, _total,
                _user_id, _tickers, _ebc_mode, _philosophy_mode, _ct, _ic,
            )

        result = await step.run(f"day-{day}", make_day_handler)
        if result.get("cancelled"):
            return {"status": "cancelled", "job_id": job_id}

    # ── Step 3: Finalize ───────────────────────────────────────────────────
    await step.run("finalize", lambda: _finalize(job_id, mongo_id))

    return {"status": "completed", "job_id": job_id}
