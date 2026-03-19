"""FastAPI dependency functions for common request-scoped values."""

from fastapi import Depends, HTTPException, Request

from db.supabase import get_user_role


def get_current_user(request: Request) -> str:
    """
    Extract the authenticated user's Clerk ID from request state.

    Requires ClerkAuthMiddleware to have run first.
    Raises HTTPException(401) if user_id is not set.
    """
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id


def require_admin(user_id: str = Depends(get_current_user)) -> str:
    """Allow only admin and superadmin roles. Raises 403 for regular users."""
    role = get_user_role(user_id)
    if role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


def require_superadmin(user_id: str = Depends(get_current_user)) -> str:
    """Allow only superadmin role. Raises 403 for admin and regular users."""
    role = get_user_role(user_id)
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return user_id
