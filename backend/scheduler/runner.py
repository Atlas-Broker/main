# backend/scheduler/runner.py
"""
Multi-window watchlist scheduler.

Runs the Atlas pipeline for all connected users at each scan window that falls
on a US market day. The scan windows are derived from each user's per-ticker
schedule stored in the watchlist table:

  1×/day → 16:30 ET
  3×/day → 08:30, 13:00, 16:30 ET
  6×/day → 06:30, 09:30, 12:00, 13:30, 15:00, 16:30 ET

At each window, only the tickers whose schedule includes that window are run.

Configuration (env vars):
  SCHEDULER_TICKERS  — comma-separated fallback tickers when a user has no saved
                       watchlist (default: AAPL,MSFT,TSLA,NVDA,META).
                       Falls back to WATCHLIST_TICKERS for backwards compat.
  SCHEDULER_EBC_MODE — override boundary mode per run (default: per-user profile).
  SCHEDULER_USER_ID  — Clerk user_id for v1 single-user mode.
"""
import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from services.watchlist_service import ALL_SCAN_WINDOWS, get_tickers_for_window

logger = logging.getLogger(__name__)

EASTERN = ZoneInfo("America/New_York")

# US federal market holidays on fixed dates.
_FIXED_HOLIDAYS: frozenset[tuple[int, int]] = frozenset({
    (1, 1),    # New Year's Day
    (7, 4),    # Independence Day
    (12, 25),  # Christmas Day
})


def _is_market_day(d: date) -> bool:
    """Return True if d is a weekday that is not a fixed US market holiday."""
    if d.weekday() >= 5:
        return False
    if (d.month, d.day) in _FIXED_HOLIDAYS:
        return False
    return True


def next_scan_window(from_dt: datetime | None = None) -> tuple[datetime, tuple[int, int]]:
    """
    Return (next_window_dt, (hour, minute)) for the next scan window after from_dt.
    Skips non-market days. Looks up to 10 days ahead to handle long weekends.
    """
    now = from_dt or datetime.now(tz=EASTERN)

    for day_offset in range(10):
        candidate_date = now.date() + timedelta(days=day_offset)
        if not _is_market_day(candidate_date):
            continue
        for (h, m) in ALL_SCAN_WINDOWS:
            candidate = datetime(
                candidate_date.year, candidate_date.month, candidate_date.day,
                h, m, 0, 0,
                tzinfo=EASTERN,
            )
            if candidate > now:
                return candidate, (h, m)

    raise RuntimeError("Could not determine next scan window within 10 days")


def _get_fallback_tickers() -> list[str]:
    """Return tickers from env vars (used when a user has no saved watchlist)."""
    raw = os.getenv("SCHEDULER_TICKERS") or os.getenv("WATCHLIST_TICKERS", "AAPL,MSFT,TSLA,NVDA,META")
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


def _get_ebc_mode_override() -> str | None:
    return os.getenv("SCHEDULER_EBC_MODE") or None


def _get_user_boundary_mode(user_id: str) -> str:
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


# Shared state for the /scheduler/status endpoint.
_state: dict = {
    "enabled": True,
    "next_run_utc": None,
    "last_run_utc": None,
    "last_run_results": [],
    "watchlist": [],
    "tickers": [],
    "ebc_mode": None,
    "active_users": 0,
}


def get_state() -> dict:
    return dict(_state)


async def run_watchlist_for_user(
    user_id: str,
    tickers: list[str],
) -> list[dict]:
    """
    Run the full pipeline for a set of tickers for a single user.
    Returns per-ticker result summaries.
    """
    from services.pipeline_service import run_pipeline_with_ebc

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
            logger.error(
                "[Scheduler] Pipeline failed for user=%s ticker=%s: %s",
                user_id, ticker, exc,
            )
            summary = {"user_id": user_id, "ticker": ticker, "status": "error", "error": str(exc)}

        results.append(summary)

    return results


async def run_all_users(
    override_user_id: str | None = None,
    window: tuple[int, int] | None = None,
) -> list[dict]:
    """
    Run the pipeline for all connected users at the given scan window.

    Resolution order:
    1. override_user_id — explicit caller (e.g. /trigger endpoint)
    2. SCHEDULER_USER_ID env var — v1 single-user mode
    3. Active broker connections from the database (multi-user mode)

    For each user, tickers are determined by their saved watchlist filtered to
    the current window. Falls back to env-var tickers when no watchlist is saved.
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

    logger.info("[Scheduler] Running for %d user(s) at window %s: %s", len(user_ids), window, user_ids)

    fallback_tickers = _get_fallback_tickers()
    all_results: list[dict] = []

    for uid in user_ids:
        if window is not None:
            tickers = await asyncio.to_thread(get_tickers_for_window, uid, window)
            if not tickers:
                logger.info(
                    "[Scheduler] user=%s has no tickers for window %s — using fallback %s",
                    uid, window, fallback_tickers,
                )
                tickers = fallback_tickers
        else:
            # Called without a window (e.g. manual trigger) — use all saved tickers or fallback
            from services.watchlist_service import get_watchlist
            saved = await asyncio.to_thread(get_watchlist, uid)
            tickers = [e["ticker"] for e in saved] if saved else fallback_tickers

        if not tickers:
            continue

        results = await run_watchlist_for_user(uid, tickers)
        all_results.extend(results)

    return all_results


async def scheduler_loop() -> None:
    """
    Main scheduler loop. Sleeps until the next scan window (ET), fires the pipeline
    for each user's tickers at that window, then repeats indefinitely.
    """
    ebc_mode = _get_ebc_mode_override()
    _state["enabled"] = True
    _state["ebc_mode"] = ebc_mode

    logger.info(
        "[Scheduler] Started | windows=%s | ebc_mode=%s",
        ALL_SCAN_WINDOWS, ebc_mode or "per-user-profile",
    )

    while True:
        next_dt, window = next_scan_window()
        now = datetime.now(tz=EASTERN)
        sleep_secs = (next_dt - now).total_seconds()

        _state["next_run_utc"] = next_dt.astimezone(ZoneInfo("UTC")).isoformat()

        logger.info(
            "[Scheduler] Next window: %02d:%02d ET on %s (%.0f s from now)",
            window[0], window[1],
            next_dt.strftime("%Y-%m-%d"),
            sleep_secs,
        )

        await asyncio.sleep(sleep_secs)

        _state["last_run_utc"] = datetime.now(tz=ZoneInfo("UTC")).isoformat()
        results = await run_all_users(window=window)
        _state["last_run_results"] = results
        _state["active_users"] = len({r.get("user_id") for r in results})
        # Update tickers list with whatever ran in this window
        _state["tickers"] = list({r["ticker"] for r in results if r.get("ticker")})
        _state["watchlist"] = _state["tickers"]
