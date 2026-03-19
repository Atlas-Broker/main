# backend/tests/test_philosophy.py
"""
Tests for Philosophy Skills overlay in the Atlas agent pipeline.

Route tests use the dual-patch auth pattern:
  - patch("api.middleware.auth.ClerkAuthMiddleware.dispatch")
  - app.dependency_overrides[get_current_user] = lambda: "user_test"
"""
from unittest.mock import patch, MagicMock
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


# ── Unit tests: get_philosophy_prefix ─────────────────────────────────────────

class TestGetPhilosophyPrefix:
    def test_get_philosophy_prefix_value_returns_nonempty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("value")

        assert isinstance(result, str)
        assert len(result) > 0
        assert "value" in result.lower() or "intrinsic" in result.lower() or "margin" in result.lower()

    def test_get_philosophy_prefix_momentum_returns_nonempty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("momentum")

        assert isinstance(result, str)
        assert len(result) > 0

    def test_get_philosophy_prefix_macro_returns_nonempty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("macro")

        assert isinstance(result, str)
        assert len(result) > 0

    def test_get_philosophy_prefix_balanced_returns_empty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("balanced")

        assert result == ""

    def test_get_philosophy_prefix_none_returns_empty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix(None)

        assert result == ""

    def test_get_philosophy_prefix_unknown_mode_returns_empty_string(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("unknown_mode")

        assert result == ""

    def test_get_philosophy_prefix_value_includes_header(self):
        from agents.philosophy import get_philosophy_prefix

        result = get_philosophy_prefix("value")

        assert "[Investment Philosophy:" in result

    def test_philosophy_prompts_has_all_required_keys(self):
        from agents.philosophy import PHILOSOPHY_PROMPTS

        assert "value" in PHILOSOPHY_PROMPTS
        assert "momentum" in PHILOSOPHY_PROMPTS
        assert "macro" in PHILOSOPHY_PROMPTS
        assert "balanced" in PHILOSOPHY_PROMPTS

    def test_philosophy_prompts_balanced_is_empty(self):
        from agents.philosophy import PHILOSOPHY_PROMPTS

        assert PHILOSOPHY_PROMPTS["balanced"] == ""


# ── Route tests: POST /v1/pipeline/run ────────────────────────────────────────

class TestPipelineRunPhilosophyMode:
    def _mock_pipeline_result(self):
        return {
            "signal": {
                "id": "trace-abc",
                "ticker": "AAPL",
                "action": "HOLD",
                "confidence": 0.5,
                "reasoning": "Test reasoning",
                "boundary_mode": "advisory",
                "risk": {
                    "stop_loss": 170.0,
                    "take_profit": 190.0,
                    "position_size": 10,
                    "risk_reward_ratio": 2.0,
                },
                "trace_id": "trace-abc",
                "latency_ms": 123,
                "created_at": "2026-01-01T00:00:00+00:00",
            },
            "execution": {
                "status": "skipped",
                "executed": False,
                "mode": "advisory",
                "message": "Advisory mode — no execution.",
                "order_id": None,
                "override_window_s": None,
            },
        }

    def test_pipeline_run_accepts_philosophy_mode_value(self, client):
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ):
            resp = client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "AAPL",
                    "boundary_mode": "advisory",
                    "philosophy_mode": "value",
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 200

    def test_pipeline_run_accepts_philosophy_mode_momentum(self, client):
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ):
            resp = client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "AAPL",
                    "boundary_mode": "advisory",
                    "philosophy_mode": "momentum",
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 200

    def test_pipeline_run_accepts_philosophy_mode_macro(self, client):
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ):
            resp = client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "AAPL",
                    "boundary_mode": "advisory",
                    "philosophy_mode": "macro",
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 200

    def test_pipeline_run_accepts_philosophy_mode_balanced(self, client):
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ):
            resp = client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "AAPL",
                    "boundary_mode": "advisory",
                    "philosophy_mode": "balanced",
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 200

    def test_pipeline_run_accepts_no_philosophy_mode(self, client):
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ):
            resp = client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "AAPL",
                    "boundary_mode": "advisory",
                },
                headers={"Authorization": "Bearer fake"},
            )
        assert resp.status_code == 200

    def test_pipeline_run_rejects_invalid_philosophy_mode(self, client):
        resp = client.post(
            "/v1/pipeline/run",
            json={
                "ticker": "AAPL",
                "boundary_mode": "advisory",
                "philosophy_mode": "random",
            },
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422

    def test_pipeline_run_rejects_invalid_philosophy_mode_speculative(self, client):
        resp = client.post(
            "/v1/pipeline/run",
            json={
                "ticker": "AAPL",
                "boundary_mode": "advisory",
                "philosophy_mode": "speculative",
            },
            headers={"Authorization": "Bearer fake"},
        )
        assert resp.status_code == 422

    def test_pipeline_run_forwards_philosophy_mode_to_service(self, client):
        """Verify the route passes philosophy_mode through to run_pipeline_with_ebc."""
        with patch(
            "api.routes.pipeline.run_pipeline_with_ebc",
            return_value=self._mock_pipeline_result(),
        ) as mock_service:
            client.post(
                "/v1/pipeline/run",
                json={
                    "ticker": "TSLA",
                    "boundary_mode": "advisory",
                    "philosophy_mode": "macro",
                },
                headers={"Authorization": "Bearer fake"},
            )
        mock_service.assert_called_once_with(
            ticker="TSLA",
            boundary_mode="advisory",
            user_id=_FAKE_USER,
            philosophy_mode="macro",
        )
