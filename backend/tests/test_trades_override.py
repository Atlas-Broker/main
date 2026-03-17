"""Integration tests for POST /v1/trades/{id}/override."""
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from api.dependencies import get_current_user

_FAKE_USER = "user-123"


async def _mock_dispatch(self, request, call_next):
    request.state.user_id = _FAKE_USER
    return await call_next(request)


@pytest.fixture()
def client():
    from main import app
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _mock_dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


def test_override_trade_success(client):
    with patch(
        "services.trade_service.cancel_and_log",
        return_value={"success": True, "message": "Order cancelled successfully"},
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={"reason": "changed my mind"},
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "cancelled" in body["message"].lower()


def test_override_trade_window_expired(client):
    with patch(
        "services.trade_service.cancel_and_log",
        side_effect=HTTPException(status_code=409, detail="Override window has closed (5 min limit)"),
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 409
    assert "5 min" in response.json()["detail"]


def test_override_trade_not_found(client):
    with patch(
        "services.trade_service.cancel_and_log",
        side_effect=HTTPException(status_code=404, detail="Trade not found"),
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 404


def test_override_trade_already_overridden(client):
    with patch(
        "services.trade_service.cancel_and_log",
        return_value={"success": True, "message": "Trade already overridden"},
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"Authorization": "Bearer fake"},
        )

    assert response.status_code == 200
    assert "already" in response.json()["message"].lower()


def test_override_trade_missing_auth():
    from fastapi import FastAPI
    from api.routes.trades import router as trades_router

    minimal_app = FastAPI()
    minimal_app.include_router(trades_router)
    client = TestClient(minimal_app)
    response = client.post("/v1/trades/trade-abc/override", json={})
    assert response.status_code == 401
