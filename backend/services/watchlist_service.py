# backend/services/watchlist_service.py
"""
Per-user watchlist with per-ticker scan schedules.

get_watchlist(user_id)             → list[{ticker, schedule}]
save_watchlist(user_id, entries)   → None  (full replace)
get_tickers_for_window(user_id, window) → list[str]
"""
import logging
from db.supabase import get_supabase

logger = logging.getLogger(__name__)

# Mapping of schedule code → set of (hour, minute) windows that trigger it (ET)
SCHEDULE_WINDOWS: dict[str, frozenset[tuple[int, int]]] = {
    "1x": frozenset({(16, 30)}),
    "3x": frozenset({(8, 30), (13, 0), (16, 30)}),
    "6x": frozenset({(6, 30), (9, 30), (12, 0), (13, 30), (15, 0), (16, 30)}),
}

# All distinct scan windows across all schedules, sorted chronologically
ALL_SCAN_WINDOWS: list[tuple[int, int]] = sorted(
    {w for windows in SCHEDULE_WINDOWS.values() for w in windows}
)

DEFAULT_WATCHLIST: list[dict] = [
    {"ticker": "META",  "schedule": "3x"},
    {"ticker": "AAPL",  "schedule": "3x"},
    {"ticker": "NVDA",  "schedule": "3x"},
    {"ticker": "AMZN",  "schedule": "3x"},
    {"ticker": "MSFT",  "schedule": "3x"},
]


def get_watchlist(user_id: str) -> list[dict]:
    """Return watchlist entries for user_id, ordered by creation time."""
    sb = get_supabase()
    result = (
        sb.table("watchlist")
        .select("ticker, schedule")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


def save_watchlist(user_id: str, entries: list[dict]) -> None:
    """Replace the user's entire watchlist with entries (full overwrite)."""
    sb = get_supabase()
    sb.table("watchlist").delete().eq("user_id", user_id).execute()
    if entries:
        rows = [
            {"user_id": user_id, "ticker": e["ticker"], "schedule": e["schedule"]}
            for e in entries
        ]
        sb.table("watchlist").insert(rows).execute()


def get_tickers_for_window(user_id: str, window: tuple[int, int]) -> list[str]:
    """
    Return the tickers that should be scanned for user_id at a given (hour, minute) window.
    Falls back to an empty list if the user has no saved watchlist (caller handles fallback).
    """
    entries = get_watchlist(user_id)
    return [
        e["ticker"]
        for e in entries
        if window in SCHEDULE_WINDOWS.get(e.get("schedule", "3x"), frozenset())
    ]
