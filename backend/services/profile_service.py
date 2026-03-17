"""Profile service — manages user profile rows in Supabase."""

import logging

logger = logging.getLogger(__name__)


def get_supabase_client():
    from services.supabase_client import get_supabase_client as _get
    return _get()


def create_profile(user_id: str, email: str, display_name: str) -> None:
    try:
        client = get_supabase_client()
        client.table("profiles").upsert({
            "id": user_id,
            "email": email,
            "display_name": display_name,
            "boundary_mode": "advisory",
            "onboarding_completed": False,
        }).execute()
        logger.info("Profile upserted for user_id=%s", user_id)
    except Exception as exc:
        logger.error("Failed to upsert profile for user_id=%s: %s", user_id, exc)


def get_profile(user_id: str) -> dict | None:
    try:
        client = get_supabase_client()
        result = (
            client.table("profiles")
            .select("*")
            .eq("id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error("Failed to get profile for user_id=%s: %s", user_id, exc)
        return None
