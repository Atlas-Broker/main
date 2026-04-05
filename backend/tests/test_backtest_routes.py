# backend/tests/test_backtest_routes.py
"""
Route tests use FastAPI dependency_overrides to bypass Clerk JWT auth,
combined with patching ClerkAuthMiddleware.dispatch to bypass the ASGI
middleware layer that runs before dependency injection.
"""
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

_FAKE_USER = "user_test"


async def _mock_dispatch(self, request, call_next):
    request.state.user_id = _FAKE_USER
    return await call_next(request)


@pytest.fixture
def client():
    from main import app
    from api.dependencies import get_current_user, require_admin
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    app.dependency_overrides[require_admin] = lambda: _FAKE_USER
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _mock_dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_backtest_returns_job_id(client):
    with patch("api.routes.backtest.create_job", return_value="job-123"), \
         patch("api.routes.backtest.list_jobs", return_value=[]), \
         patch("api.routes.backtest.run_backtest_job"):
        resp = client.post("/v1/backtest", json={
            "tickers": ["AAPL"],
            "start_date": "2025-01-01",
            "end_date": "2025-02-01",
            "ebc_mode": "advisory",
        }, headers={"Authorization": "Bearer fake"})
    assert resp.status_code == 200
    assert resp.json()["job_id"] == "job-123"


def test_create_backtest_rejects_future_end_date(client):
    resp = client.post("/v1/backtest", json={
        "tickers": ["AAPL"],
        "start_date": "2026-01-01",
        "end_date": "2099-12-31",
        "ebc_mode": "advisory",
    }, headers={"Authorization": "Bearer fake"})
    assert resp.status_code == 422


def test_delete_running_job_returns_409(client):
    with patch("api.routes.backtest.delete_job", return_value=False):
        resp = client.delete("/v1/backtest/job-123", headers={"Authorization": "Bearer fake"})
    assert resp.status_code == 409


def test_delete_unknown_job_returns_404(client):
    with patch("api.routes.backtest.delete_job", return_value=None):
        resp = client.delete("/v1/backtest/job-999", headers={"Authorization": "Bearer fake"})
    assert resp.status_code == 404
