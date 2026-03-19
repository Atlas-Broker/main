# backend/tests/test_rbac.py
"""
RBAC tests for Atlas.

Dual-patch pattern:
  1. patch ClerkAuthMiddleware.dispatch — bypasses JWT verification
  2. app.dependency_overrides[get_current_user] — injects a fake user_id

For role checks, mock db.supabase.get_user_role to return a specific role.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_current_user

_ADMIN_USER = "user_admin_001"
_SUPER_USER = "user_super_001"
_REGULAR_USER = "user_regular_001"
_TARGET_USER = "user_target_001"


async def _mock_dispatch(self, request, call_next):
    request.state.user_id = getattr(request.state, "user_id", _REGULAR_USER)
    return await call_next(request)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


def _make_client(fake_user_id: str) -> TestClient:
    from main import app

    app.dependency_overrides[get_current_user] = lambda: fake_user_id

    async def _dispatch(self, request, call_next):
        request.state.user_id = fake_user_id
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        client = TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()
    return client


@pytest.fixture()
def regular_client():
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _REGULAR_USER

    async def _dispatch(self, request, call_next):
        request.state.user_id = _REGULAR_USER
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def admin_client():
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _ADMIN_USER

    async def _dispatch(self, request, call_next):
        request.state.user_id = _ADMIN_USER
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def super_client():
    from main import app

    app.dependency_overrides[get_current_user] = lambda: _SUPER_USER

    async def _dispatch(self, request, call_next):
        request.state.user_id = _SUPER_USER
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


# ─── Tests: require_admin ────────────────────────────────────────────────────


def test_admin_endpoint_blocks_user_role(regular_client):
    """Users with role='user' get 403 on admin-only endpoints."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        # Use the scheduler trigger endpoint which requires admin
        resp = regular_client.post(
            "/v1/scheduler/run-now",
            headers={"Authorization": "Bearer fake"},
        )
    # scheduler/run-now uses get_current_user, not require_admin currently —
    # test with a direct call to the dependency via users PATCH (which needs superadmin)
    # Instead, test via GET /v1/profile/me to verify admin dep. We test require_admin
    # indirectly by patching the dependency in a route that uses require_admin.
    # The scheduler/run-now route only requires get_current_user (not admin).
    # We'll test via PATCH /v1/users/{id}/role which requires require_superadmin.
    # For require_admin specifically, we verify the dependency function directly.
    from fastapi import HTTPException
    import pytest

    from api.dependencies import require_admin

    with patch("api.dependencies.get_user_role", return_value="user"):
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user_id=_REGULAR_USER)
        assert exc_info.value.status_code == 403
        assert "Admin" in exc_info.value.detail


def test_admin_endpoint_allows_admin_role():
    """Users with role='admin' pass the require_admin check."""
    from api.dependencies import require_admin

    with patch("api.dependencies.get_user_role", return_value="admin"):
        result = require_admin(user_id=_ADMIN_USER)
    assert result == _ADMIN_USER


def test_admin_endpoint_allows_superadmin_role():
    """Superadmins also pass the require_admin check."""
    from api.dependencies import require_admin

    with patch("api.dependencies.get_user_role", return_value="superadmin"):
        result = require_admin(user_id=_SUPER_USER)
    assert result == _SUPER_USER


# ─── Tests: require_superadmin ────────────────────────────────────────────────


def test_patch_role_requires_superadmin_blocks_admin(admin_client):
    """Admin role gets 403 on PATCH /v1/users/{id}/role."""
    with patch("api.dependencies.get_user_role", return_value="admin"):
        resp = admin_client.patch(
            f"/v1/users/{_TARGET_USER}/role",
            json={"role": "admin"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403
    assert "SuperAdmin" in resp.json()["detail"]


def test_patch_role_requires_superadmin_blocks_user(regular_client):
    """Regular users get 403 on PATCH /v1/users/{id}/role."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        resp = regular_client.patch(
            f"/v1/users/{_TARGET_USER}/role",
            json={"role": "admin"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403


def test_patch_role_requires_superadmin_allows_superadmin(super_client):
    """Superadmins can call PATCH /v1/users/{id}/role."""
    fake_sb_result = type("R", (), {"data": [{"id": _TARGET_USER, "role": "admin"}]})()
    with (
        patch("api.dependencies.get_user_role", return_value="superadmin"),
        patch("api.routes.users.get_supabase") as mock_sb,
    ):
        mock_sb.return_value.table.return_value.update.return_value.eq.return_value.execute.return_value = fake_sb_result
        resp = super_client.patch(
            f"/v1/users/{_TARGET_USER}/role",
            json={"role": "admin"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == _TARGET_USER
    assert data["role"] == "admin"


# ─── Tests: GET /v1/profile/me returns role ───────────────────────────────────


def test_get_profile_me_returns_role(regular_client):
    """GET /v1/profile/me returns the user's profile with a role field."""
    fake_profile = {
        "id": _REGULAR_USER,
        "boundary_mode": "conditional",
        "display_name": "Test User",
        "email": "test@example.com",
        "onboarding_completed": False,
    }
    with (
        patch("api.routes.profile.get_profile", return_value=fake_profile),
        patch("api.routes.profile.get_user_role", return_value="user"),
    ):
        resp = regular_client.get(
            "/v1/profile/me",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "user"
    assert data["id"] == _REGULAR_USER


def test_get_profile_me_returns_admin_role(admin_client):
    """GET /v1/profile/me returns 'admin' role for admin users."""
    fake_profile = {
        "id": _ADMIN_USER,
        "boundary_mode": "advisory",
        "display_name": "Admin User",
        "email": "admin@example.com",
        "onboarding_completed": True,
    }
    with (
        patch("api.routes.profile.get_profile", return_value=fake_profile),
        patch("api.routes.profile.get_user_role", return_value="admin"),
    ):
        resp = admin_client.get(
            "/v1/profile/me",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "admin"


# ─── Tests: get_user_role helper ─────────────────────────────────────────────


def test_get_user_role_returns_default_on_missing():
    """get_user_role returns 'user' when profile row is missing."""
    from db.supabase import get_user_role as _get_user_role

    mock_result = type("R", (), {"data": None})()
    with patch("db.supabase.get_supabase") as mock_sb:
        mock_sb.return_value.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_result
        role = _get_user_role("nonexistent_user")
    assert role == "user"


def test_get_user_role_returns_stored_role():
    """get_user_role returns the role stored in the profiles table."""
    from db.supabase import get_user_role as _get_user_role

    mock_result = type("R", (), {"data": {"role": "superadmin"}})()
    with patch("db.supabase.get_supabase") as mock_sb:
        mock_sb.return_value.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_result
        role = _get_user_role("some_user")
    assert role == "superadmin"


def test_get_user_role_returns_default_on_exception():
    """get_user_role returns 'user' if Supabase raises an exception."""
    from db.supabase import get_user_role as _get_user_role

    with patch("db.supabase.get_supabase", side_effect=Exception("DB down")):
        role = _get_user_role("any_user")
    assert role == "user"
