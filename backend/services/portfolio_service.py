"""Portfolio service — manages portfolio rows in Supabase."""

import logging

logger = logging.getLogger(__name__)


def get_supabase_client():
    from services.supabase_client import get_supabase_client as _get
    return _get()


def get_or_create_portfolio(user_id: str) -> dict | None:
    try:
        client = get_supabase_client()
        result = (
            client.table("portfolios")
            .upsert(
                {"user_id": user_id},
                on_conflict="user_id",
            )
            .execute()
        )
        logger.info("Portfolio upserted for user_id=%s", user_id)
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error("Failed to upsert portfolio for user_id=%s: %s", user_id, exc)
        return None
