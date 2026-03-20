# backend/services/profile_service.py
"""
User profile service.
create_profile(user_id, email, display_name) → None  (called by webhook)
get_profile(user_id)              → dict (creates defaults if row missing)
update_profile(user_id, updates)  → None
"""
import logging
from db.supabase import get_supabase

logger = logging.getLogger(__name__)

_DEFAULTS = {
    "boundary_mode": "advisory",
    "display_name": None,
    "onboarding_completed": False,
    "tier": "free",
}


def create_profile(user_id: str, email: str, display_name: str) -> None:
    """Called by Clerk webhook on user.created."""
    try:
        sb = get_supabase()
        sb.table("profiles").upsert({
            "id": user_id,
            "email": email,
            "display_name": display_name,
            "boundary_mode": "advisory",
            "onboarding_completed": False,
        }).execute()
        logger.info("Profile upserted for user_id=%s", user_id)
    except Exception as exc:
        logger.error("Failed to upsert profile for user_id=%s: %s", user_id, exc)


def get_profile(user_id: str) -> dict:
    """
    Return the profile for user_id.
    If the row is missing (webhook delivery failure), auto-create with advisory
    defaults and log a warning.
    """
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if result and result.data:
        data = result.data
        return {**data, "tier": data.get("tier", "free")}
    logger.warning(
        "Profile not found for user_id %r — Clerk webhook may have missed this user. "
        "Auto-creating with advisory defaults.",
        user_id,
    )
    sb.table("profiles").insert({
        "id": user_id,
        "email": "",
        "boundary_mode": "advisory",
        "onboarding_completed": False,
    }).execute()
    return {"id": user_id, **_DEFAULTS}


def update_profile(user_id: str, updates: dict) -> None:
    """Apply updates dict to the profile row for user_id."""
    sb = get_supabase()
    sb.table("profiles").update(updates).eq("id", user_id).execute()
