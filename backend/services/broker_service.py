# backend/services/broker_service.py
"""
Broker connection service — manages per-user broker credentials in Supabase.

Public API:
  get_connection(user_id, broker, environment) → dict | None
  upsert_api_key_connection(user_id, api_key, api_secret, environment) → None
  deactivate_connection(user_id, broker, environment) → None
  get_active_user_ids() → list[str]  ← used by the scheduler
"""
import logging
from datetime import datetime, timezone

from db.supabase import get_supabase

logger = logging.getLogger(__name__)


def get_connection(
    user_id: str,
    broker: str = "alpaca",
    environment: str = "paper",
) -> dict | None:
    """
    Return the active broker connection for a user, or None if not connected.
    api_secret is included — callers that return this to the frontend must mask it.
    """
    sb = get_supabase()
    result = (
        sb.table("broker_connections")
        .select("*")
        .eq("user_id", user_id)
        .eq("broker", broker)
        .eq("environment", environment)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def upsert_api_key_connection(
    user_id: str,
    api_key: str,
    api_secret: str,
    environment: str = "paper",
    broker: str = "alpaca",
) -> None:
    """
    Save or update API key credentials for a user.
    On conflict (same user + broker + environment) the row is updated.
    """
    sb = get_supabase()
    sb.table("broker_connections").upsert(
        {
            "user_id": user_id,
            "broker": broker,
            "auth_method": "api_key",
            "environment": environment,
            "api_key": api_key,
            "api_secret": api_secret,
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id,broker,environment",
    ).execute()
    logger.info(
        "Broker connection upserted: user=%s broker=%s env=%s",
        user_id, broker, environment,
    )


def deactivate_connection(
    user_id: str,
    broker: str = "alpaca",
    environment: str = "paper",
) -> None:
    """
    Soft-delete a broker connection (sets is_active = false).
    Preserves the row so reconnecting is a simple update.
    """
    sb = get_supabase()
    sb.table("broker_connections").update(
        {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("user_id", user_id).eq("broker", broker).eq("environment", environment).execute()
    logger.info(
        "Broker connection deactivated: user=%s broker=%s env=%s",
        user_id, broker, environment,
    )


def get_active_user_ids(broker: str = "alpaca") -> list[str]:
    """
    Return all user IDs that have an active broker connection.
    Used by the scheduler to discover who to run the pipeline for.
    """
    sb = get_supabase()
    result = (
        sb.table("broker_connections")
        .select("user_id")
        .eq("broker", broker)
        .eq("is_active", True)
        .execute()
    )
    return [row["user_id"] for row in (result.data or [])]
