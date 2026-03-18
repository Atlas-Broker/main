# backend/api/routes/broker.py
"""
Broker connection management endpoints.

GET    /v1/broker/connection       — Connection status for the authenticated user.
                                     api_secret is masked (last 4 chars only).
POST   /v1/broker/connection       — Save Alpaca API key + secret.
DELETE /v1/broker/connection       — Disconnect (soft-delete, preserves the row).

Future: POST /v1/broker/oauth/alpaca     — Start OAuth flow (redirect to Alpaca)
        GET  /v1/broker/oauth/callback   — OAuth callback handler
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.dependencies import get_current_user
from services.broker_service import (
    deactivate_connection,
    get_connection,
    upsert_api_key_connection,
)

router = APIRouter(prefix="/v1/broker", tags=["broker"])
logger = logging.getLogger(__name__)


def _mask_secret(secret: str | None) -> str | None:
    """Return only the last 4 characters of a secret — never expose the full value."""
    if not secret:
        return None
    return f"{'*' * (len(secret) - 4)}{secret[-4:]}"


class ConnectApiKeyRequest(BaseModel):
    api_key: str
    api_secret: str
    environment: str = "paper"

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        if v not in ("paper", "live"):
            raise ValueError("environment must be 'paper' or 'live'")
        return v

    @field_validator("api_key", "api_secret")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


@router.get("/connection")
def get_broker_connection(user_id: str = Depends(get_current_user)):
    """
    Return the user's active broker connection status.
    api_secret is always masked — the full value is never returned.
    """
    conn = get_connection(user_id)
    if not conn:
        return {"connected": False, "broker": None}

    return {
        "connected": True,
        "broker": conn["broker"],
        "auth_method": conn["auth_method"],
        "environment": conn["environment"],
        "api_key": conn.get("api_key"),
        "api_secret_masked": _mask_secret(conn.get("api_secret")),
        "created_at": conn.get("created_at"),
        "updated_at": conn.get("updated_at"),
    }


@router.post("/connection")
def connect_api_key(req: ConnectApiKeyRequest, user_id: str = Depends(get_current_user)):
    """
    Save Alpaca API key + secret for the authenticated user.
    Validates the credentials by calling get_account() before saving.
    """
    # Validate credentials before saving — fail fast with a clear message
    try:
        from broker.alpaca import AlpacaAdapter
        adapter = AlpacaAdapter(
            api_key=req.api_key,
            secret_key=req.api_secret,
            paper=(req.environment == "paper"),
        )
        adapter.get_account()
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Missing credential: {exc}")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Alpaca credentials are invalid or unreachable: {exc}",
        )

    upsert_api_key_connection(
        user_id=user_id,
        api_key=req.api_key,
        api_secret=req.api_secret,
        environment=req.environment,
    )
    logger.info("Broker connected: user=%s env=%s", user_id, req.environment)
    return {
        "connected": True,
        "broker": "alpaca",
        "environment": req.environment,
        "message": "Alpaca connection saved and verified.",
    }


@router.delete("/connection")
def disconnect_broker(
    environment: str = "paper",
    user_id: str = Depends(get_current_user),
):
    """
    Disconnect the user's broker connection (soft-delete).
    Reconnecting later is a simple re-POST without needing to re-enter from scratch
    if the user still has their keys.
    """
    deactivate_connection(user_id, environment=environment)
    logger.info("Broker disconnected: user=%s env=%s", user_id, environment)
    return {"connected": False, "message": "Broker connection deactivated."}
