"""
Supabase service-key client singleton.
Uses the service key — RLS is bypassed.
Every query on user data MUST include .eq("user_id", user_id).
"""
import os
from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return the singleton Supabase client, creating it on first call."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client


def get_user_tier(user_id: str) -> str:
    """Return the user's tier ('free', 'pro', 'max'). Defaults to 'free' on error."""
    try:
        sb = get_supabase()
        result = (
            sb.table("profiles")
            .select("tier")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            return result.data.get("tier", "free") or "free"
    except Exception:
        pass
    return "free"


def get_user_role(user_id: str) -> str:
    """
    Return the RBAC role for the given user_id.
    Reads profiles.role from Supabase.
    Returns 'user' as the safe default if the row is missing or has no role.
    """
    try:
        sb = get_supabase()
        result = (
            sb.table("profiles")
            .select("role")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data and result.data.get("role"):
            return result.data["role"]
    except Exception:
        pass
    return "user"
