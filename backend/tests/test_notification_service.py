# backend/tests/test_notification_service.py
"""
Tests for the Resend guardrail notification service.

Mocks both Clerk (httpx) and the Resend SDK so no real network calls are made.
"""
from __future__ import annotations

import importlib
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reload_service():
    """Reload the module so env-var constants are re-evaluated."""
    import services.notification_service as mod
    importlib.reload(mod)
    return mod


def _clerk_ok_response(email: str = "user@example.com", user_id: str = "user_abc"):
    """Return a mock httpx.Response for a successful Clerk user lookup."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "primary_email_address_id": "ea_1",
        "email_addresses": [{"id": "ea_1", "email_address": email}],
    }
    return mock_resp


def _clerk_error_response(status_code: int = 404):
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    return mock_resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_email_sent_when_credentials_present():
    """Happy path: both RESEND_API_KEY and CLERK_SECRET_KEY are set."""
    env = {
        "RESEND_API_KEY": "re_test_key",
        "CLERK_SECRET_KEY": "clerk_test_key",
        "RESEND_FROM_EMAIL": "noreply@test.com",
        "NEXT_PUBLIC_APP_URL": "https://app.test/dashboard",
    }

    mock_resend = MagicMock()

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        # Patch httpx.AsyncClient used inside _get_user_email
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=_clerk_ok_response("user@example.com"))

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            with patch.dict("sys.modules", {"resend": mock_resend}):
                await mod.send_guardrail_notification(
                    user_id="user_abc",
                    ticker="AAPL",
                    action="BUY",
                    confidence=0.58,
                    reasoning="Momentum positive",
                )

    mock_resend.Emails.send.assert_called_once()
    call_params = mock_resend.Emails.send.call_args[0][0]
    assert call_params["to"] == ["user@example.com"]
    assert "AAPL" in call_params["subject"]
    assert "58%" in call_params["subject"]
    assert "BUY" in call_params["subject"]


@pytest.mark.asyncio
async def test_no_email_sent_when_resend_api_key_missing(caplog):
    """RESEND_API_KEY not set — function returns early without sending."""
    env = {
        "RESEND_API_KEY": "",
        "CLERK_SECRET_KEY": "clerk_test_key",
    }

    mock_resend = MagicMock()

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        with patch.dict("sys.modules", {"resend": mock_resend}):
            with caplog.at_level(logging.DEBUG, logger="services.notification_service"):
                await mod.send_guardrail_notification(
                    user_id="user_abc",
                    ticker="TSLA",
                    action="SELL",
                    confidence=0.50,
                    reasoning="Weak momentum",
                )

    mock_resend.Emails.send.assert_not_called()
    assert "RESEND_API_KEY" in caplog.text


@pytest.mark.asyncio
async def test_no_email_sent_when_clerk_returns_non_200(caplog):
    """Clerk API returns 404 — email lookup fails, no email sent."""
    env = {
        "RESEND_API_KEY": "re_test_key",
        "CLERK_SECRET_KEY": "clerk_test_key",
    }

    mock_resend = MagicMock()

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=_clerk_error_response(404))

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            with patch.dict("sys.modules", {"resend": mock_resend}):
                with caplog.at_level(logging.WARNING, logger="services.notification_service"):
                    await mod.send_guardrail_notification(
                        user_id="user_abc",
                        ticker="MSFT",
                        action="HOLD",
                        confidence=0.40,
                        reasoning="No clear trend",
                    )

    mock_resend.Emails.send.assert_not_called()
    assert "404" in caplog.text


@pytest.mark.asyncio
async def test_function_never_raises_on_resend_error():
    """Even if Resend SDK raises, send_guardrail_notification must not propagate."""
    env = {
        "RESEND_API_KEY": "re_test_key",
        "CLERK_SECRET_KEY": "clerk_test_key",
    }

    mock_resend = MagicMock()
    mock_resend.Emails.send.side_effect = RuntimeError("Resend API down")

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(return_value=_clerk_ok_response())

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            with patch.dict("sys.modules", {"resend": mock_resend}):
                # Should complete without raising
                await mod.send_guardrail_notification(
                    user_id="user_abc",
                    ticker="NVDA",
                    action="BUY",
                    confidence=0.55,
                    reasoning="Strong buy signal",
                )


@pytest.mark.asyncio
async def test_function_never_raises_on_clerk_network_error():
    """Even if the Clerk HTTP call raises a network error, function must not propagate."""
    env = {
        "RESEND_API_KEY": "re_test_key",
        "CLERK_SECRET_KEY": "clerk_test_key",
    }

    mock_resend = MagicMock()

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            with patch.dict("sys.modules", {"resend": mock_resend}):
                await mod.send_guardrail_notification(
                    user_id="user_abc",
                    ticker="GOOG",
                    action="SELL",
                    confidence=0.48,
                    reasoning="Bearish divergence",
                )

    mock_resend.Emails.send.assert_not_called()


@pytest.mark.asyncio
async def test_no_email_sent_when_clerk_key_missing(caplog):
    """CLERK_SECRET_KEY not set — _get_user_email returns None, no email sent."""
    env = {
        "RESEND_API_KEY": "re_test_key",
        "CLERK_SECRET_KEY": "",
    }

    mock_resend = MagicMock()

    with patch.dict("os.environ", env, clear=False):
        mod = _reload_service()

        with patch.dict("sys.modules", {"resend": mock_resend}):
            with caplog.at_level(logging.WARNING, logger="services.notification_service"):
                await mod.send_guardrail_notification(
                    user_id="user_abc",
                    ticker="AAPL",
                    action="BUY",
                    confidence=0.60,
                    reasoning="Near threshold",
                )

    mock_resend.Emails.send.assert_not_called()
    assert "CLERK_SECRET_KEY" in caplog.text
