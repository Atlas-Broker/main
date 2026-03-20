# backend/scheduler/runner.py
"""
Daily watchlist scheduler.

Runs the Atlas pipeline for ALL connected users every US market day at 9:30 AM ET.
Each user runs with their own Alpaca credentials and their own boundary_mode from profiles.
When SCHEDULER_USER_ID is set, only that single user is scheduled (v1 single-user mode).
When SCHEDULER_EBC_MODE is set, it overrides per-user profile boundary_mode.

Configuration (env vars):
  SCHEDULER_ENABLED   — "true" to activate (default: false)
  SCHEDULER_TICKERS   — comma-separated tickers (default: AAPL,MSFT,TSLA,NVDA,META)
                        Falls back to WATCHLIST_TICKERS for backward compatibility.
  SCHEDULER_EBC_MODE  — override boundary mode: advisory/autonomous_guardrail/autonomous (default: per-user profile)
  SCHEDULER_USER_ID   — Clerk user_id to attribute scheduled runs to (v1 single-user mode).
                        When set, only this user is scheduled; broker_connections table is ignored.
"""
import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

EASTERN = ZoneInfo("America/New_York")
MARKET_OPEN_HOUR = 9
MARKET_OPEN_MINUTE = 30

# US federal market holidays (month, day) that fall on fixed dates.
# Variable-date holidays (MLK, Presidents, Memorial, Labor, Thanksgiving, Good Friday)
# are skipped here — yfinance returns prior close data on those days, which is valid
# for signal generation purposes.
_FIXED_HOLIDAYS: frozenset[tuple[int, int]] = frozenset({
    (1, 1),   # New Year's Day
    (7, 4),   # Independence Day
    (12, 25), # Christmas Day
})


def _is_market_day(d: date) -> bool:
    """Return True if d is a weekday and not a fixed US market holiday."""
    if d.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    if (d.month, d.day) in _FIXED_HOLIDAYS:
        return False
    return True


def next_market_open(from_dt: datetime | None = None) -> datetime:
    """
    Return the next 9:30 AM ET on a market day.
    If from_dt is before 9:30 AM ET on a market day, returns today's open.
    """
    now = from_dt or datetime.now(tz=EASTERN)
    candidate = now.replace(
        hour=MARKET_OPEN_HOUR,
        minute=MARKET_OPEN_MINUTE,
        second=0,
        microsecond=0,
    )
    if candidate <= now:
        candidate += timedelta(days=1)

    while not _is_market_day(candidate.date()):
        candidate += timedelta(days=1)

    return candidate


def _get_watchlist() -> list[str]:
    # SCHEDULER_TICKERS takes priority; fall back to legacy WATCHLIST_TICKERS
    raw = os.getenv("SCHEDULER_TICKERS") or os.getenv("WATCHLIST_TICKERS", "AAPL,MSFT,TSLA,NVDA,META")
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


def _get_ebc_mode_override() -> str | None:
    """Return SCHEDULER_EBC_MODE if set, otherwise None (use per-user profile)."""
    return os.getenv("SCHEDULER_EBC_MODE") or None


def _get_user_boundary_mode(user_id: str) -> str:
    """
    Fetch the boundary_mode to use for a scheduled run.
    Priority: SCHEDULER_EBC_MODE env var > user's Supabase profile > 'advisory'.
    """
    override = _get_ebc_mode_override()
    if override:
        return override
    try:
        from services.profile_service import get_profile
        profile = get_profile(user_id)
        return profile.get("boundary_mode", "advisory")
    except Exception as exc:
        logger.warning("[Scheduler] Could not fetch boundary_mode for %s: %s", user_id, exc)
        return "advisory"


# Shared state for the status endpoint — module-level is fine for a single-process server.
_state: dict = {
    "enabled": False,
    "next_run_utc": None,
    "last_run_utc": None,
    "last_run_results": [],
    "watchlist": [],
    "tickers": [],        # alias for watchlist — exposed in /status for clarity
    "ebc_mode": None,     # SCHEDULER_EBC_MODE value, or None (per-user profile)
    "active_users": 0,
}


def get_state() -> dict:
    return dict(_state)


async def run_watchlist_for_user(user_id: str) -> list[dict]:
    """
    Run the full watchlist pipeline for a single user.
    Uses the user's boundary_mode from their profile.
    Returns per-ticker result summaries.
    """
    from services.pipeline_service import run_pipeline_with_ebc

    tickers = _get_watchlist()
    boundary_mode = await asyncio.to_thread(_get_user_boundary_mode, user_id)

    logger.info(
        "[Scheduler] user=%s | mode=%s | tickers=%s",
        user_id, boundary_mode, tickers,
    )

    results: list[dict] = []
    for ticker in tickers:
        try:
            result = await asyncio.to_thread(
                run_pipeline_with_ebc,
                ticker=ticker,
                boundary_mode=boundary_mode,
                user_id=user_id,
            )
            signal = result["signal"]
            summary = {
                "user_id": user_id,
                "ticker": ticker,
                "action": signal["action"],
                "confidence": signal["confidence"],
                "status": "ok",
                "trace_id": signal.get("trace_id"),
            }
            logger.info(
                "[Scheduler] %s %s → %s (%.0f%% conf)",
                user_id, ticker, signal["action"], signal["confidence"] * 100,
            )
        except Exception as exc:
            logger.error("[Scheduler] Pipeline failed for user=%s ticker=%s: %s", user_id, ticker, exc)
            summary = {"user_id": user_id, "ticker": ticker, "status": "error", "error": str(exc)}

        results.append(summary)

    return results


async def run_all_users(override_user_id: str | None = None) -> list[dict]:
    """
    Run the watchlist pipeline for all connected users (or just override_user_id).

    Resolution order for user list:
    1. override_user_id — explicit caller (e.g. /trigger endpoint)
    2. SCHEDULER_USER_ID env var — v1 single-user mode
    3. Active broker connections from the database (multi-user mode)

    Used by both the scheduled loop and the /trigger endpoint.
    """
    from services.broker_service import get_active_user_ids

    if override_user_id:
        user_ids = [override_user_id]
    elif scheduler_user_id := os.getenv("SCHEDULER_USER_ID"):
        user_ids = [scheduler_user_id]
        logger.info("[Scheduler] Single-user mode via SCHEDULER_USER_ID: %s", scheduler_user_id)
    else:
        user_ids = await asyncio.to_thread(get_active_user_ids)

    if not user_ids:
        logger.info("[Scheduler] No active broker connections found — skipping run.")
        return []

    logger.info("[Scheduler] Running for %d user(s): %s", len(user_ids), user_ids)

    all_results: list[dict] = []
    for uid in user_ids:
        results = await run_watchlist_for_user(uid)
        all_results.extend(results)

    return all_results


async def scheduler_loop() -> None:
    """
    Main scheduler loop. Sleeps until next 9:30 AM ET market open, runs all connected users,
    repeats. Runs as a background asyncio task alongside the keep-alive loop.
    """
    watchlist = _get_watchlist()
    ebc_mode = _get_ebc_mode_override()
    _state["enabled"] = True
    _state["watchlist"] = watchlist
    _state["tickers"] = watchlist
    _state["ebc_mode"] = ebc_mode

    logger.info(
        "[Scheduler] Started | watchlist=%s | ebc_mode=%s",
        watchlist, ebc_mode or "per-user-profile",
    )

    while True:
        next_run = next_market_open()
        now = datetime.now(tz=EASTERN)
        sleep_secs = (next_run - now).total_seconds()

        _state["next_run_utc"] = next_run.astimezone(ZoneInfo("UTC")).isoformat()

        logger.info(
            "[Scheduler] Next run: %s ET (%.0f seconds from now)",
            next_run.strftime("%Y-%m-%d %H:%M"), sleep_secs,
        )

        await asyncio.sleep(sleep_secs)

        _state["last_run_utc"] = datetime.now(tz=ZoneInfo("UTC")).isoformat()
        results = await run_all_users()
        _state["last_run_results"] = results
        _state["active_users"] = len({r.get("user_id") for r in results})
