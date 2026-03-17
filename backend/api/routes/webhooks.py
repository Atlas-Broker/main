"""Clerk webhook handler."""

import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

from services import profile_service, portfolio_service

load_dotenv()

router = APIRouter(tags=["webhooks"])
logger = logging.getLogger(__name__)


def verify_svix_signature(payload: bytes, headers: dict) -> dict:
    required_headers = ["svix-id", "svix-timestamp", "svix-signature"]
    for h in required_headers:
        if h not in headers:
            raise HTTPException(status_code=400, detail=f"Missing required header: {h}")

    secret = os.getenv("CLERK_WEBHOOK_SECRET")
    if not secret:
        logger.error("CLERK_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        wh = Webhook(secret)
        return wh.verify(payload, headers)
    except WebhookVerificationError as exc:
        logger.warning("Svix signature verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid webhook signature")


@router.post("/webhooks/clerk")
async def clerk_webhook(request: Request):
    body = await request.body()
    headers = dict(request.headers)

    event = verify_svix_signature(body, headers)
    event_type = event.get("type")

    if event_type == "user.created":
        data = event.get("data", {})
        user_id = data.get("id")

        email_entries = data.get("email_addresses", [])
        primary_id = data.get("primary_email_address_id")
        email = next(
            (e["email_address"] for e in email_entries if e.get("id") == primary_id),
            email_entries[0]["email_address"] if email_entries else "",
        )

        first_name = data.get("first_name") or ""
        last_name = data.get("last_name") or ""
        display_name = f"{first_name} {last_name}".strip() or email

        logger.info("Clerk user.created webhook: user_id=%s email=%s", user_id, email)

        profile_service.create_profile(
            user_id=user_id,
            email=email,
            display_name=display_name,
        )
        portfolio_service.get_or_create_portfolio(user_id)

    else:
        logger.debug("Unhandled Clerk webhook event type: %s", event_type)

    return {"status": "ok"}
