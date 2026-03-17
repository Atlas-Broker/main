"""FastAPI dependency functions for common request-scoped values."""

from fastapi import HTTPException, Request


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
