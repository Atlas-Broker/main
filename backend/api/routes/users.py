# backend/api/routes/users.py
"""
PATCH /v1/users/{target_user_id}/role — assign a role to a user.
Requires superadmin.
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import require_superadmin
from db.supabase import get_supabase

router = APIRouter(prefix="/v1/users", tags=["users"])
logger = logging.getLogger(__name__)

VALID_ROLES = ("user", "admin", "superadmin")


class RoleUpdate(BaseModel):
    role: Literal["user", "admin", "superadmin"]


@router.patch("/{target_user_id}/role")
def patch_user_role(
    target_user_id: str,
    body: RoleUpdate,
    _: str = Depends(require_superadmin),
) -> dict:
    """Assign a role to a target user. Only superadmins may call this."""
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .update({"role": body.role})
        .eq("id", target_user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    logger.info("Role updated for user_id=%s → role=%s", target_user_id, body.role)
    return {"user_id": target_user_id, "role": body.role}
