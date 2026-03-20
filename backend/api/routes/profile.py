# backend/api/routes/profile.py
"""
GET  /v1/profile  — return the current user's profile
PATCH /v1/profile — update boundary_mode or display_name
"""
import logging
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.dependencies import get_current_user
from db.supabase import get_user_role, get_user_tier
from services.profile_service import get_profile, update_profile

router = APIRouter(prefix="/v1", tags=["profile"])
logger = logging.getLogger(__name__)


class ProfileUpdate(BaseModel):
    boundary_mode: Literal["advisory", "autonomous_guardrail", "autonomous"] | None = None
    display_name: str | None = None


@router.get("/profile/me")
def read_profile_me(user_id: str = Depends(get_current_user)) -> dict:
    """Return the current user's profile including their RBAC role."""
    profile = get_profile(user_id)
    role = get_user_role(user_id)
    return {**profile, "role": role}


@router.get("/profile")
def read_profile(user_id: str = Depends(get_current_user)) -> dict:
    """Return the current user's profile including their tier."""
    profile = get_profile(user_id)
    return {**profile, "tier": profile.get("tier", "free")}


@router.patch("/profile")
def patch_profile(body: ProfileUpdate, user_id: str = Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=422,
            detail="No valid fields provided. Writable fields: boundary_mode, display_name.",
        )
    update_profile(user_id, updates)
    return get_profile(user_id)
