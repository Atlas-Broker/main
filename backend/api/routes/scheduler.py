# backend/api/routes/scheduler.py
"""
Scheduler management endpoints.

GET  /v1/scheduler/status  — Current scheduler state (next run, last results, watchlist).
POST /v1/scheduler/run-now — Immediately run the full watchlist pipeline.
                             Useful for testing from /admin and for one-off runs.
                             The caller's Clerk user ID is used — results appear in their dashboard.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from api.dependencies import get_current_user
from scheduler.runner import get_state, next_market_open, run_all_users

router = APIRouter(prefix="/v1/scheduler", tags=["scheduler"])
logger = logging.getLogger(__name__)


@router.get("/status")
def scheduler_status(_: str = Depends(get_current_user)):
    """Return the current scheduler state: enabled flag, next run time, last results."""
    state = get_state()
    now_et = datetime.now(tz=ZoneInfo("America/New_York"))
    next_open = next_market_open(from_dt=now_et)

    return {
        **state,
        "next_market_open_et": next_open.strftime("%Y-%m-%d %H:%M ET"),
        "current_time_et": now_et.strftime("%Y-%m-%d %H:%M ET"),
    }


@router.post("/trigger")
async def trigger(user_id: str = Depends(get_current_user)):
    """
    Alias for run-now. Immediately run the full watchlist for the authenticated user.
    Results appear in the caller's dashboard — does not affect other users.
    """
    logger.info("[Scheduler] /trigger invoked by user %s", user_id)
    results = await run_all_users(override_user_id=user_id)
    ok = sum(1 for r in results if r.get("status") == "ok")
    errors = sum(1 for r in results if r.get("status") == "error")
    return {
        "triggered_by": user_id,
        "tickers_run": len(results),
        "succeeded": ok,
        "failed": errors,
        "results": results,
    }


@router.post("/run-now")
async def run_now(user_id: str = Depends(get_current_user)):
    """
    Immediately run the full watchlist for the authenticated user only.
    Results appear in the caller's dashboard — does not affect other users.
    Requires an active Alpaca connection (connect in Settings first).
    """
    logger.info("[Scheduler] Manual run-now triggered by user %s", user_id)
    results = await run_all_users(override_user_id=user_id)
    ok = sum(1 for r in results if r.get("status") == "ok")
    errors = sum(1 for r in results if r.get("status") == "error")
    return {
        "triggered_by": user_id,
        "tickers_run": len(results),
        "succeeded": ok,
        "failed": errors,
        "results": results,
    }
