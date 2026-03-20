"""
Resend guardrail notification service.

Called when the boundary controller holds a signal due to guardrail threshold.
Sends a transactional email via the Resend Python SDK.
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

CLERK_SECRET_KEY: str = os.getenv("CLERK_SECRET_KEY", "")
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL: str = os.getenv("RESEND_FROM_EMAIL", "noreply@atlas.ai")
DASHBOARD_URL: str = os.getenv("NEXT_PUBLIC_APP_URL", "https://atlas.ai/dashboard")


async def _get_user_email(user_id: str) -> str | None:
    """Fetch the primary email address for a Clerk user. Returns None on any failure."""
    if not CLERK_SECRET_KEY:
        logger.warning("CLERK_SECRET_KEY not set — cannot fetch user email for guardrail notification")
        return None
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://api.clerk.com/v1/users/{user_id}",
                headers={"Authorization": f"Bearer {CLERK_SECRET_KEY}"},
                timeout=5.0,
            )
            if r.status_code != 200:
                logger.warning(
                    "Clerk returned %s for user %s — skipping guardrail notification",
                    r.status_code,
                    user_id,
                )
                return None
            data = r.json()
            primary_id = data.get("primary_email_address_id")
            for e in data.get("email_addresses", []):
                if e.get("id") == primary_id:
                    return e.get("email_address")
    except Exception as exc:
        logger.warning("Failed to fetch user email from Clerk: %s", exc)
    return None


async def send_guardrail_notification(
    user_id: str,
    ticker: str,
    action: str,
    confidence: float,
    reasoning: str,
) -> None:
    """
    Send a guardrail-triggered email to the user.

    Never raises — all exceptions are logged and swallowed.

    Args:
        user_id:    Clerk user ID.
        ticker:     Asset ticker, e.g. "AAPL".
        action:     Signal action — "BUY" | "SELL" | "HOLD".
        confidence: Raw confidence value between 0.0 and 1.0.
        reasoning:  Human-readable reasoning from the agent signal.
    """
    try:
        if not RESEND_API_KEY:
            logger.warning(
                "RESEND_API_KEY not set — skipping guardrail notification for user %s",
                user_id,
            )
            return

        email = await _get_user_email(user_id)
        if not email:
            return

        try:
            import resend  # noqa: PLC0415
        except ImportError:
            logger.warning("resend package not installed — cannot send guardrail notification")
            return

        resend.api_key = RESEND_API_KEY
        confidence_pct = round(confidence * 100)

        params: resend.Emails.SendParams = {
            "from": RESEND_FROM_EMAIL,
            "to": [email],
            "subject": f"Atlas Guardrail: {action} {ticker} held ({confidence_pct}% confidence)",
            "html": (
                "<p>Atlas held a signal because confidence was below the guardrail threshold.</p>"
                "<ul>"
                f"<li><strong>Ticker:</strong> {ticker}</li>"
                f"<li><strong>Action:</strong> {action}</li>"
                f"<li><strong>Confidence:</strong> {confidence_pct}%</li>"
                f"<li><strong>Reasoning:</strong> {reasoning}</li>"
                "</ul>"
                f'<p><a href="{DASHBOARD_URL}">View your dashboard &rarr;</a></p>'
            ),
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(
            "Guardrail notification sent to %s for %s %s (%.0f%% confidence)",
            email,
            action,
            ticker,
            confidence * 100,
        )
    except Exception as exc:
        logger.error("Unexpected error in send_guardrail_notification: %s", exc)
