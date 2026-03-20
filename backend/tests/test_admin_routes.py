# backend/tests/test_admin_routes.py
"""
Tests for admin API routes.

Auth pattern (dual-patch):
  1. patch ClerkAuthMiddleware.dispatch — bypasses JWT verification
  2. app.dependency_overrides[get_current_user] — injects fake user_id

Role is controlled by patching api.dependencies.get_user_role.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

_ADMIN_USER = "user_admin_001"
_SUPER_USER = "user_super_001"
_REGULAR_USER = "user_regular_001"


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def admin_client():
    from main import app
    from api.dependencies import get_current_user

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
    from api.dependencies import get_current_user

    app.dependency_overrides[get_current_user] = lambda: _SUPER_USER

    async def _dispatch(self, request, call_next):
        request.state.user_id = _SUPER_USER
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def regular_client():
    from main import app
    from api.dependencies import get_current_user

    app.dependency_overrides[get_current_user] = lambda: _REGULAR_USER

    async def _dispatch(self, request, call_next):
        request.state.user_id = _REGULAR_USER
        return await call_next(request)

    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


# ─── Helper: fake Supabase builder ────────────────────────────────────────────


def _make_sb_result(data):
    """Create a minimal fake result object with a .data attribute."""
    return type("R", (), {"data": data})()


# ─── GET /v1/admin/stats ──────────────────────────────────────────────────────


def test_stats_returns_expected_keys(admin_client):
    """GET /v1/admin/stats returns all required top-level keys."""
    profiles_data = [
        {"tier": "free"},
        {"tier": "pro"},
        {"tier": "max"},
        {"tier": "free"},
    ]
    trades_data = [{"id": "t1"}, {"id": "t2"}]

    def _mock_table(name):
        mock = MagicMock()
        if name == "profiles":
            mock.select.return_value.execute.return_value = _make_sb_result(profiles_data)
        elif name == "trades":
            (
                mock.select.return_value
                .eq.return_value
                .gte.return_value
                .execute.return_value
            ) = _make_sb_result(trades_data)
        return mock

    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin.get_supabase") as mock_sb,
        patch("api.routes.admin._count_signals_today", return_value=5),
    ):
        mock_sb.return_value.table.side_effect = _mock_table
        resp = admin_client.get(
            "/v1/admin/stats",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    for key in ("total_users", "free_count", "pro_count", "max_count", "signals_today", "executions_today"):
        assert key in data, f"Missing key: {key}"

    assert data["total_users"] == 4
    assert data["free_count"] == 2
    assert data["pro_count"] == 1
    assert data["max_count"] == 1
    assert data["signals_today"] == 5
    assert data["executions_today"] == 2


def test_stats_blocks_regular_user(regular_client):
    """GET /v1/admin/stats returns 403 for non-admin users."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        resp = regular_client.get(
            "/v1/admin/stats",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403


def test_stats_returns_zeros_on_db_error(admin_client):
    """GET /v1/admin/stats returns zero counts if Supabase raises."""
    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin.get_supabase", side_effect=Exception("DB down")),
        patch("api.routes.admin._count_signals_today", return_value=0),
    ):
        resp = admin_client.get(
            "/v1/admin/stats",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] == 0
    assert data["signals_today"] == 0


# ─── GET /v1/admin/users ──────────────────────────────────────────────────────


def test_users_returns_list(admin_client):
    """GET /v1/admin/users returns a list of user objects."""
    profiles_data = [
        {
            "id": "user_abc",
            "display_name": "John Doe",
            "tier": "free",
            "role": "user",
            "created_at": "2026-03-01T00:00:00Z",
        }
    ]
    broker_data = []  # no connected brokers

    def _mock_table(name):
        mock = MagicMock()
        if name == "profiles":
            mock.select.return_value.execute.return_value = _make_sb_result(profiles_data)
        elif name == "broker_connections":
            mock.select.return_value.execute.return_value = _make_sb_result(broker_data)
        return mock

    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin.get_supabase") as mock_sb,
        patch("api.routes.admin.get_clerk_emails", new_callable=AsyncMock, return_value={"user_abc": "john@example.com"}),
    ):
        mock_sb.return_value.table.side_effect = _mock_table
        resp = admin_client.get(
            "/v1/admin/users",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    user = data[0]
    assert user["id"] == "user_abc"
    assert user["email"] == "john@example.com"
    assert user["broker_connected"] is False


def test_users_shows_broker_connected(admin_client):
    """GET /v1/admin/users marks broker_connected=True when a row exists."""
    profiles_data = [
        {
            "id": "user_xyz",
            "display_name": "Jane",
            "tier": "pro",
            "role": "user",
            "created_at": "2026-01-01T00:00:00Z",
        }
    ]
    broker_data = [{"user_id": "user_xyz"}]

    def _mock_table(name):
        mock = MagicMock()
        if name == "profiles":
            mock.select.return_value.execute.return_value = _make_sb_result(profiles_data)
        elif name == "broker_connections":
            mock.select.return_value.execute.return_value = _make_sb_result(broker_data)
        return mock

    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin.get_supabase") as mock_sb,
        patch("api.routes.admin.get_clerk_emails", new_callable=AsyncMock, return_value={}),
    ):
        mock_sb.return_value.table.side_effect = _mock_table
        resp = admin_client.get(
            "/v1/admin/users",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert resp.json()[0]["broker_connected"] is True


def test_users_blocks_regular_user(regular_client):
    """GET /v1/admin/users returns 403 for non-admin users."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        resp = regular_client.get(
            "/v1/admin/users",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403


# ─── PATCH /v1/admin/users/{user_id}/tier ─────────────────────────────────────


def test_patch_tier_valid_tier_returns_200(super_client):
    """PATCH /v1/admin/users/{id}/tier with a valid tier returns 200."""
    updated_row = {
        "id": "user_abc",
        "display_name": "John",
        "tier": "pro",
        "role": "user",
        "created_at": "2026-03-01T00:00:00Z",
    }
    mock_result = _make_sb_result([updated_row])

    with (
        patch("api.dependencies.get_user_role", return_value="superadmin"),
        patch("api.routes.admin.get_supabase") as mock_sb,
    ):
        (
            mock_sb.return_value.table.return_value
            .update.return_value
            .eq.return_value
            .execute.return_value
        ) = mock_result
        resp = super_client.patch(
            "/v1/admin/users/user_abc/tier",
            json={"tier": "pro"},
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert resp.json()["tier"] == "pro"


def test_patch_tier_invalid_tier_returns_422(super_client):
    """PATCH /v1/admin/users/{id}/tier with an invalid tier returns 422."""
    with patch("api.dependencies.get_user_role", return_value="superadmin"):
        resp = super_client.patch(
            "/v1/admin/users/user_abc/tier",
            json={"tier": "enterprise"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 422


def test_patch_tier_blocks_admin(admin_client):
    """PATCH /v1/admin/users/{id}/tier returns 403 for non-superadmin admins."""
    with patch("api.dependencies.get_user_role", return_value="admin"):
        resp = admin_client.patch(
            "/v1/admin/users/user_abc/tier",
            json={"tier": "pro"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403


def test_patch_tier_blocks_regular_user(regular_client):
    """PATCH /v1/admin/users/{id}/tier returns 403 for regular users."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        resp = regular_client.patch(
            "/v1/admin/users/user_abc/tier",
            json={"tier": "pro"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403


def test_patch_tier_user_not_found_returns_404(super_client):
    """PATCH /v1/admin/users/{id}/tier returns 404 when user doesn't exist."""
    mock_result = _make_sb_result([])  # empty = not found

    with (
        patch("api.dependencies.get_user_role", return_value="superadmin"),
        patch("api.routes.admin.get_supabase") as mock_sb,
    ):
        (
            mock_sb.return_value.table.return_value
            .update.return_value
            .eq.return_value
            .execute.return_value
        ) = mock_result
        resp = super_client.patch(
            "/v1/admin/users/unknown_user/tier",
            json={"tier": "max"},
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 404


# ─── GET /v1/admin/system-status ─────────────────────────────────────────────


EXPECTED_SERVICE_KEYS = {"pipeline", "scheduler", "alpaca", "ibkr", "mongodb", "supabase"}


def test_system_status_returns_expected_keys(admin_client):
    """GET /v1/admin/system-status returns all expected service keys."""
    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin._ping_mongo", return_value=True),
        patch("api.routes.admin._check_supabase_health", return_value={"status": "online", "last_checked": "now", "detail": "Connected"}),
        patch("api.routes.admin._check_alpaca_health", new_callable=AsyncMock, return_value={"status": "online", "last_checked": "now", "detail": "Connection OK"}),
        patch("api.routes.admin._check_pipeline_health", return_value={"status": "online", "last_checked": "now", "detail": "Last run: 2026-03-20T13:30:00Z"}),
    ):
        resp = admin_client.get(
            "/v1/admin/system-status",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert EXPECTED_SERVICE_KEYS == set(data.keys()), f"Unexpected keys: {set(data.keys())}"


def test_system_status_each_service_has_status_field(admin_client):
    """Each service object in system-status has at least a 'status' field."""
    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin._ping_mongo", return_value=False),
        patch("api.routes.admin._check_supabase_health", return_value={"status": "offline", "last_checked": "now", "detail": "Connection failed"}),
        patch("api.routes.admin._check_alpaca_health", new_callable=AsyncMock, return_value={"status": "degraded", "last_checked": "now", "detail": "Unreachable"}),
        patch("api.routes.admin._check_pipeline_health", return_value={"status": "offline", "last_checked": "now", "detail": "No signals found"}),
    ):
        resp = admin_client.get(
            "/v1/admin/system-status",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    for service_key in EXPECTED_SERVICE_KEYS:
        service = data[service_key]
        assert "status" in service, f"{service_key} missing 'status'"
        assert "last_checked" in service, f"{service_key} missing 'last_checked'"
        assert service["status"] in ("online", "degraded", "offline"), \
            f"{service_key} has unexpected status: {service['status']}"


def test_system_status_scheduler_always_online(admin_client):
    """Scheduler is always reported as online."""
    with (
        patch("api.dependencies.get_user_role", return_value="admin"),
        patch("api.routes.admin._ping_mongo", return_value=False),
        patch("api.routes.admin._check_supabase_health", return_value={"status": "offline", "last_checked": "now", "detail": ""}),
        patch("api.routes.admin._check_alpaca_health", new_callable=AsyncMock, return_value={"status": "offline", "last_checked": "now", "detail": ""}),
        patch("api.routes.admin._check_pipeline_health", return_value={"status": "offline", "last_checked": "now", "detail": ""}),
    ):
        resp = admin_client.get(
            "/v1/admin/system-status",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert resp.json()["scheduler"]["status"] == "online"


def test_system_status_blocks_regular_user(regular_client):
    """GET /v1/admin/system-status returns 403 for non-admin users."""
    with patch("api.dependencies.get_user_role", return_value="user"):
        resp = regular_client.get(
            "/v1/admin/system-status",
            headers={"Authorization": "Bearer fake"},
        )
    assert resp.status_code == 403
