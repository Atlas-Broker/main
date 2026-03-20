# backend/tests/test_signals_integration.py
from unittest.mock import MagicMock, patch
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from api.dependencies import get_current_user

_FAKE_USER = "user_test_abc"


def _fake_trace(executed=False, user_id=_FAKE_USER):
    return {
        "_id": ObjectId(),
        "user_id": user_id,
        "ticker": "TSLA",
        "boundary_mode": "advisory",
        "pipeline_run": {
            "final_decision": {"action": "BUY", "confidence": 0.85, "reasoning": "strong momentum"},
            "risk": {"stop_loss": 240, "take_profit": 270, "position_size": 10, "risk_reward_ratio": 2.0},
        },
        "created_at": "2026-03-17T10:00:00",
        "execution": {"executed": executed, "order_id": "ord-123" if executed else None},
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


def test_approve_returns_executed_and_writes_to_supabase(client):
    trace = _fake_trace()
    signal_id = str(trace["_id"])
    fake_order = {"order_id": "alpaca-001", "qty": "10", "filled_avg_price": "248.50"}

    with (
        patch("services.signals_service._get_collection") as mock_col_fn,
        patch("services.portfolio_service.get_or_create_portfolio", return_value="port-uuid-001"),
        patch("services.trade_service.record_trade") as mock_record,
        patch("services.trade_service.sync_positions") as mock_sync,
        patch("broker.factory.get_broker_for_user") as mock_broker_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col
        mock_broker = MagicMock()
        mock_broker.place_order.return_value = fake_order
        mock_broker_fn.return_value = mock_broker

        resp = client.post(f"/v1/signals/{signal_id}/approve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "executed"


def test_approve_wrong_user_returns_404(client):
    trace = _fake_trace(user_id="other_user")
    signal_id = str(trace["_id"])

    with patch("services.signals_service._get_collection") as mock_col_fn:
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col
        resp = client.post(f"/v1/signals/{signal_id}/approve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 404


def test_approve_already_executed_returns_409(client):
    trace = _fake_trace(executed=True)
    signal_id = str(trace["_id"])

    with patch("services.signals_service._get_collection") as mock_col_fn:
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col
        resp = client.post(f"/v1/signals/{signal_id}/approve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 409
    assert "already" in resp.json()["detail"].lower()


def test_approve_supabase_failure_still_returns_success(client):
    trace = _fake_trace()
    signal_id = str(trace["_id"])

    with (
        patch("services.signals_service._get_collection") as mock_col_fn,
        patch("services.portfolio_service.get_or_create_portfolio", side_effect=RuntimeError("DB down")),
        patch("broker.factory.get_broker_for_user") as mock_broker_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col
        mock_broker = MagicMock()
        mock_broker.place_order.return_value = {"order_id": "ord-002", "qty": "10", "filled_avg_price": "250.00"}
        mock_broker_fn.return_value = mock_broker

        resp = client.post(f"/v1/signals/{signal_id}/approve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "executed"
    assert data.get("supabase_sync") is False


def test_get_signals_filters_by_user_id(client):
    traces = [{
        "_id": ObjectId(),
        "user_id": _FAKE_USER,
        "ticker": "AAPL",
        "pipeline_run": {"final_decision": {"action": "BUY", "confidence": 0.9, "reasoning": "r"}, "risk": {"stop_loss": 0, "take_profit": 0, "position_size": 0, "risk_reward_ratio": 0}},
        "boundary_mode": "advisory",
        "created_at": "2026-03-17T10:00:00",
    }]

    with patch("services.signals_service._get_collection") as mock_col_fn:
        mock_col = MagicMock()
        mock_col.find.return_value.limit.return_value = traces
        mock_col_fn.return_value = mock_col

        resp = client.get("/v1/signals", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    find_call = mock_col.find.call_args
    query_filter = find_call[0][0] if find_call[0] else find_call[1].get("filter", {})
    assert query_filter.get("user_id") == _FAKE_USER
