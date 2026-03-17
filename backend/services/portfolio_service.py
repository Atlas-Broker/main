# backend/services/portfolio_service.py
"""
Portfolio acquisition helper.
get_or_create_portfolio(user_id) → portfolio UUID string.
"""
import logging
from db.supabase import get_supabase

logger = logging.getLogger(__name__)


def get_or_create_portfolio(user_id: str) -> str:
    """
    Return the portfolio UUID for user_id.
    Creates a default 'Paper Portfolio' row if none exists.
    Raises RuntimeError if the row cannot be retrieved after upsert.
    """
    sb = get_supabase()
    sb.table("portfolios").upsert(
        {"user_id": user_id, "name": "Paper Portfolio"},
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()
    result = (
        sb.table("portfolios")
        .select("id")
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise RuntimeError(f"Failed to resolve portfolio for user {user_id!r} after upsert")
    return result.data["id"]
