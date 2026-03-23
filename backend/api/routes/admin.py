# backend/api/routes/admin.py
"""
Admin API routes — require admin or superadmin role.

Endpoints:
  GET  /v1/admin/stats                   - platform usage stats
  GET  /v1/admin/users                   - all users with Clerk email enrichment
  PATCH /v1/admin/users/{user_id}/tier   - update a user's tier (superadmin only)
  PATCH /v1/admin/users/{user_id}/role   - update a user's role (superadmin only)
  GET  /v1/admin/system-status           - health check for all services
"""
import logging
import os
from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import require_admin, require_superadmin
from db.supabase import get_supabase

router = APIRouter(prefix="/v1/admin", tags=["admin"])
logger = logging.getLogger(__name__)

CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")


# ─── Pydantic models ──────────────────────────────────────────────────────────


class TierUpdate(BaseModel):
    tier: Literal["free", "pro", "max"]


class RoleUpdate(BaseModel):
    role: Literal["user", "admin", "superadmin"]


# ─── Clerk helpers ────────────────────────────────────────────────────────────


async def get_clerk_emails(user_ids: list[str]) -> dict[str, str]:
    """Return {user_id: email} for all given user_ids. Fails silently per user."""
    if not CLERK_SECRET_KEY:
        return {}
    headers = {"Authorization": f"Bearer {CLERK_SECRET_KEY}"}
    result: dict[str, str] = {}
    async with httpx.AsyncClient() as client:
        for uid in user_ids:
            try:
                r = await client.get(
                    f"https://api.clerk.com/v1/users/{uid}",
                    headers=headers,
                    timeout=5.0,
                )
                if r.status_code == 200:
                    data = r.json()
                    emails = data.get("email_addresses", [])
                    primary_id = data.get("primary_email_address_id")
                    for e in emails:
                        if e.get("id") == primary_id:
                            result[uid] = e.get("email_address", "")
                            break
            except Exception:
                pass
    return result


# ─── MongoDB helpers ──────────────────────────────────────────────────────────


def _get_mongo_collection():
    """Return the reasoning_traces collection. Raises EnvironmentError if URI missing."""
    from pymongo import MongoClient

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise EnvironmentError("MONGODB_URI is not set")
    client = MongoClient(uri)
    db_name = os.environ.get("MONGODB_DB_NAME", "atlas")
    return client[db_name]["reasoning_traces"]


def _count_signals_today() -> int:
    """Count reasoning_traces documents created since midnight UTC today."""
    try:
        collection = _get_mongo_collection()
        today_utc = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return collection.count_documents({"created_at": {"$gte": today_utc}})
    except Exception:
        return 0


def _get_latest_signal_timestamp() -> datetime | None:
    """Return the created_at of the most recent trace, or None."""
    try:
        from pymongo import DESCENDING

        collection = _get_mongo_collection()
        doc = collection.find_one({}, sort=[("created_at", DESCENDING)])
        if doc:
            return doc.get("created_at")
    except Exception:
        pass
    return None


def _ping_mongo() -> bool:
    """Return True if MongoDB responds to a ping command."""
    try:
        from pymongo import MongoClient

        uri = os.environ.get("MONGODB_URI")
        if not uri:
            return False
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
        return True
    except Exception:
        return False


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.get("/stats")
async def get_stats(_: str = Depends(require_admin)) -> dict:
    """Return platform-level usage statistics."""
    total_users = 0
    free_count = 0
    pro_count = 0
    max_count = 0
    executions_today = 0

    try:
        sb = get_supabase()
        profiles_result = sb.table("profiles").select("tier").execute()
        if profiles_result and profiles_result.data:
            rows = profiles_result.data
            total_users = len(rows)
            for row in rows:
                tier = row.get("tier", "free") or "free"
                if tier == "pro":
                    pro_count += 1
                elif tier == "max":
                    max_count += 1
                else:
                    free_count += 1
    except Exception:
        logger.exception("Failed to query profiles for stats")

    try:
        sb = get_supabase()
        today_utc = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ).isoformat()
        trades_result = (
            sb.table("trades")
            .select("id")
            .eq("status", "executed")
            .gte("executed_at", today_utc)
            .execute()
        )
        if trades_result and trades_result.data:
            executions_today = len(trades_result.data)
    except Exception:
        logger.exception("Failed to query trades for stats")

    signals_today = _count_signals_today()

    return {
        "total_users": total_users,
        "free_count": free_count,
        "pro_count": pro_count,
        "max_count": max_count,
        "signals_today": signals_today,
        "executions_today": executions_today,
    }


@router.get("/users")
async def list_users(_: str = Depends(require_admin)) -> list[dict]:
    """Return all users enriched with Clerk email and broker connection status."""
    sb = get_supabase()

    profiles: list[dict] = []
    try:
        result = (
            sb.table("profiles")
            .select("*")
            .execute()
        )
        if result and result.data:
            profiles = result.data
    except Exception:
        logger.exception("Failed to query profiles for user list")
        raise HTTPException(status_code=500, detail="Failed to fetch user list")

    user_ids = [p["id"] for p in profiles]

    # Fetch connected broker user ids
    connected_ids: set[str] = set()
    try:
        broker_result = (
            sb.table("broker_connections")
            .select("user_id")
            .execute()
        )
        if broker_result and broker_result.data:
            connected_ids = {row["user_id"] for row in broker_result.data}
    except Exception:
        logger.exception("Failed to query broker_connections")

    # Fetch emails from Clerk
    email_map: dict[str, str] = {}
    try:
        email_map = await get_clerk_emails(user_ids)
    except Exception:
        logger.exception("Failed to fetch Clerk emails")

    return [
        {
            "id": p["id"],
            "display_name": p.get("display_name") or "",
            "email": email_map.get(p["id"], ""),
            "tier": p.get("tier") or "free",
            "role": p.get("role") or "user",
            "created_at": p.get("created_at") or "",
            "broker_connected": p["id"] in connected_ids,
        }
        for p in profiles
    ]


@router.patch("/users/{user_id}/tier")
async def update_user_tier(
    user_id: str,
    body: TierUpdate,
    _: str = Depends(require_superadmin),
) -> dict:
    """Update the subscription tier for a given user. Requires superadmin."""
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .update({"tier": body.tier})
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    logger.info("Tier updated for user_id=%s → tier=%s", user_id, body.tier)
    return result.data[0]


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    _: str = Depends(require_superadmin),
) -> dict:
    """Update the RBAC role for a given user. Requires superadmin."""
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .update({"role": body.role})
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    logger.info("Role updated for user_id=%s → role=%s", user_id, body.role)
    return result.data[0]


@router.get("/system-status")
async def get_system_status(_: str = Depends(require_admin)) -> dict:
    """Ping all services and return their health status."""
    import asyncio
    now = datetime.now(timezone.utc).isoformat()

    # MongoDB health (blocking — run in thread pool)
    mongo_online = await asyncio.to_thread(_ping_mongo)
    mongo_status = {
        "status": "online" if mongo_online else "offline",
        "last_checked": now,
        "detail": "Connected" if mongo_online else "Connection failed",
    }

    # Supabase health (blocking — run in thread pool)
    supabase_status = await asyncio.to_thread(_check_supabase_health, now)

    # Alpaca health
    alpaca_status = await _check_alpaca_health(now)

    # Pipeline health (blocking — run in thread pool)
    pipeline_status = await asyncio.to_thread(_check_pipeline_health, now)

    # Scheduler — always online for this iteration
    scheduler_status = {
        "status": "online",
        "last_checked": now,
        "detail": "Scheduled: 13:30 UTC",
    }

    ibkr_status = {
        "status": "offline",
        "last_checked": now,
        "detail": "Not configured (future phase)",
    }

    return {
        "pipeline": pipeline_status,
        "scheduler": scheduler_status,
        "alpaca": alpaca_status,
        "ibkr": ibkr_status,
        "mongodb": mongo_status,
        "supabase": supabase_status,
    }


def _check_supabase_health(now: str) -> dict:
    try:
        sb = get_supabase()
        sb.table("profiles").select("id").limit(1).execute()
        return {"status": "online", "last_checked": now, "detail": "Connected"}
    except Exception:
        return {"status": "offline", "last_checked": now, "detail": "Connection failed"}


async def _check_alpaca_health(now: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get("https://broker-api.sandbox.alpaca.markets")
            if r.status_code < 500:
                return {"status": "online", "last_checked": now, "detail": "Connection OK"}
            return {"status": "degraded", "last_checked": now, "detail": f"HTTP {r.status_code}"}
    except Exception:
        return {"status": "degraded", "last_checked": now, "detail": "Unreachable"}


def _check_pipeline_health(now: str) -> dict:
    latest = _get_latest_signal_timestamp()
    if latest is None:
        return {"status": "offline", "last_checked": now, "detail": "No signals found"}

    # Normalise to UTC-aware
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=timezone.utc)

    age_hours = (datetime.now(timezone.utc) - latest).total_seconds() / 3600
    last_run_str = latest.isoformat()

    if age_hours <= 24:
        return {
            "status": "online",
            "last_checked": now,
            "detail": f"Last run: {last_run_str}",
        }
    return {
        "status": "degraded",
        "last_checked": now,
        "detail": f"Last run: {last_run_str}",
    }
