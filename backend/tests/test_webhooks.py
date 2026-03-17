"""Integration tests for the Clerk webhook endpoint."""

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI


def make_webhook_app():
    app = FastAPI()
    from api.routes.webhooks import router
    app.include_router(router)
    return app


USER_CREATED_PAYLOAD = {
    "type": "user.created",
    "data": {
        "id": "user_2test123",
        "email_addresses": [
            {"email_address": "test@example.com", "id": "idn_001"}
        ],
        "primary_email_address_id": "idn_001",
        "first_name": "Test",
        "last_name": "User",
    },
}


class TestClerkWebhook:
    def test_invalid_svix_signature_returns_400(self):
        app = make_webhook_app()
        client = TestClient(app, raise_server_exceptions=False)
        res = client.post(
            "/webhooks/clerk",
            content=json.dumps(USER_CREATED_PAYLOAD),
            headers={
                "Content-Type": "application/json",
                "svix-id": "msg_test",
                "svix-timestamp": "1700000000",
                "svix-signature": "v1,invalid_signature",
            },
        )
        assert res.status_code == 400

    def test_valid_user_created_triggers_profile_and_portfolio(self):
        app = make_webhook_app()
        client = TestClient(app)
        with (
            patch("api.routes.webhooks.verify_svix_signature", return_value=USER_CREATED_PAYLOAD),
            patch("api.routes.webhooks.profile_service.create_profile") as mock_profile,
            patch("api.routes.webhooks.portfolio_service.get_or_create_portfolio") as mock_portfolio,
        ):
            res = client.post(
                "/webhooks/clerk",
                content=json.dumps(USER_CREATED_PAYLOAD),
                headers={
                    "Content-Type": "application/json",
                    "svix-id": "msg_test",
                    "svix-timestamp": "1700000000",
                    "svix-signature": "v1,test",
                },
            )
        assert res.status_code == 200
        mock_profile.assert_called_once_with(
            user_id="user_2test123",
            email="test@example.com",
            display_name="Test User",
        )
        mock_portfolio.assert_called_once_with("user_2test123")

    def test_unknown_event_type_returns_200_no_op(self):
        app = make_webhook_app()
        client = TestClient(app)
        unknown_payload = {"type": "user.updated", "data": {}}
        with patch("api.routes.webhooks.verify_svix_signature", return_value=unknown_payload):
            res = client.post(
                "/webhooks/clerk",
                content=json.dumps(unknown_payload),
                headers={
                    "Content-Type": "application/json",
                    "svix-id": "msg_x",
                    "svix-timestamp": "1700000000",
                    "svix-signature": "v1,test",
                },
            )
        assert res.status_code == 200

    def test_missing_svix_headers_returns_400(self):
        app = make_webhook_app()
        client = TestClient(app, raise_server_exceptions=False)
        res = client.post(
            "/webhooks/clerk",
            content=json.dumps(USER_CREATED_PAYLOAD),
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 400
