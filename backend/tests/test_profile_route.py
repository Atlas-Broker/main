# backend/tests/test_profile_route.py
"""
Integration tests for GET /v1/profile and PATCH /v1/profile.
Uses FastAPI TestClient; uses dependency_overrides for auth dependency,
and patches ClerkAuthMiddleware.dispatch to bypass JWT verification.
"""
from unittest.mock import patch, AsyncMock
import pytest
from fastapi.testclient import TestClient
from api.dependencies import get_current_user

_FAKE_USER = "user_clerk_test_001"
_FAKE_PROFILE = {
    "id": _FAKE_USER,
    "boundary_mode": "conditional",
    "display_name": "Test User",
    "email": "test@example.com",
    "onboarding_completed": False,
}


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


def test_get_profile_returns_profile(client):
    with patch("api.routes.profile.get_profile", return_value=_FAKE_PROFILE):
        resp = client.get("/v1/profile", headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["boundary_mode"] == "conditional"
    assert data["id"] == _FAKE_USER


def test_patch_profile_updates_boundary_mode(client):
    updated = {**_FAKE_PROFILE, "boundary_mode": "advisory"}
    with (
        patch("api.routes.profile.update_profile") as mock_update,
        patch("api.routes.profile.get_profile", return_value=updated),
    ):
        resp = client.patch(
            "/v1/profile",
            json={"boundary_mode": "advisory"},
            headers={"Authorization": "Bearer fake-token"},
        )
    assert resp.status_code == 200
    mock_update.assert_called_once_with(_FAKE_USER, {"boundary_mode": "advisory"})
    assert resp.json()["boundary_mode"] == "advisory"


def test_patch_profile_rejects_invalid_mode(client):
    resp = client.patch(
        "/v1/profile",
        json={"boundary_mode": "yolo"},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 422


def test_patch_profile_empty_body_returns_422(client):
    resp = client.patch("/v1/profile", json={}, headers={"Authorization": "Bearer fake-token"})
    assert resp.status_code == 422


def test_get_profile_no_auth_returns_401():
    """
    Verify that /v1/profile returns 401 when get_current_user raises.
    Uses a minimal fresh app with a real get_current_user dependency (no user_id on state).
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient as TC
    from api.routes.profile import router as profile_router

    mini_app = FastAPI()
    mini_app.include_router(profile_router)

    mini_client = TC(mini_app)
    # No Authorization header → get_current_user raises 401
    resp = mini_client.get("/v1/profile")
    assert resp.status_code == 401
