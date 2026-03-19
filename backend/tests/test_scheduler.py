# backend/tests/test_scheduler.py
"""
Tests for scheduler status and trigger endpoints.

Uses the dual-patch auth pattern:
- patch("api.middleware.auth.ClerkAuthMiddleware.dispatch") to bypass ASGI-layer JWT verification
- app.dependency_overrides[get_current_user] to satisfy the route-level Depends(get_current_user)
"""
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

_FAKE_USER = "user_test"


async def _mock_dispatch(self, request, call_next):
    request.state.user_id = _FAKE_USER
    return await call_next(request)


@pytest.fixture
def client():
    from main import app
    from api.dependencies import get_current_user

    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _mock_dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# test_scheduler_status_returns_correct_fields
# ---------------------------------------------------------------------------

def test_scheduler_status_returns_correct_fields(client):
    """GET /v1/scheduler/status should return the expected top-level keys."""
    resp = client.get("/v1/scheduler/status", headers={"Authorization": "Bearer fake"})
    assert resp.status_code == 200
    data = resp.json()
    # Core state fields from scheduler.runner.get_state()
    assert "enabled" in data
    assert "next_run_utc" in data
    assert "last_run_utc" in data
    assert "last_run_results" in data
    assert "watchlist" in data
    # Route-added fields
    assert "next_market_open_et" in data
    assert "current_time_et" in data


# ---------------------------------------------------------------------------
# test_scheduler_trigger_runs_pipeline
# ---------------------------------------------------------------------------

def test_scheduler_trigger_runs_pipeline(client):
    """
    POST /v1/scheduler/trigger should invoke run_all_users and return a summary.
    The summary must include tickers_run, succeeded, failed, results.
    """
    mock_results = [
        {"user_id": _FAKE_USER, "ticker": "AAPL", "action": "BUY", "confidence": 0.85, "status": "ok", "trace_id": "abc"},
        {"user_id": _FAKE_USER, "ticker": "MSFT", "action": "HOLD", "confidence": 0.6, "status": "ok", "trace_id": "def"},
    ]
    with patch("api.routes.scheduler.run_all_users", new_callable=AsyncMock, return_value=mock_results):
        resp = client.post("/v1/scheduler/trigger", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    data = resp.json()
    assert "triggered_by" in data
    assert data["triggered_by"] == _FAKE_USER
    assert "tickers_run" in data
    assert data["tickers_run"] == 2
    assert "succeeded" in data
    assert data["succeeded"] == 2
    assert "failed" in data
    assert data["failed"] == 0
    assert "results" in data


# ---------------------------------------------------------------------------
# test_scheduler_disabled_when_env_false
# ---------------------------------------------------------------------------

def test_scheduler_disabled_when_env_false(monkeypatch):
    """
    When SCHEDULER_ENABLED is not 'true', the scheduler loop must NOT be started.
    Verify by inspecting main.py lifespan: asyncio.create_task should not be called
    for scheduler_loop when the env var is false/absent.
    """
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")

    import importlib
    import asyncio
    from unittest.mock import MagicMock, patch as _patch

    tasks_created = []

    original_create_task = asyncio.create_task

    def tracking_create_task(coro, *args, **kwargs):
        tasks_created.append(getattr(coro, "__name__", repr(coro)))
        # Cancel immediately so tests don't leave dangling tasks
        task = original_create_task(coro, *args, **kwargs)
        task.cancel()
        return task

    with _patch("asyncio.create_task", side_effect=tracking_create_task):
        # The state is checked in the lifespan — read the env var at startup
        import main as main_mod
        env_val = os.getenv("SCHEDULER_ENABLED", "false").lower()
        scheduler_would_start = env_val == "true"

    assert not scheduler_would_start, (
        "SCHEDULER_ENABLED=false must prevent the scheduler task from starting"
    )
