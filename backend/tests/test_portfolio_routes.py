# backend/tests/test_portfolio_routes.py
"""
Tests for equity curve and ticker decision log endpoints.

Auth pattern: dual-patch (ClerkAuthMiddleware.dispatch + dependency_overrides)
per feedback_fastapi_auth_testing.md
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

_FAKE_USER = "user_test_portfolio"


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


# ─── Equity curve ─────────────────────────────────────────────────────────────

_ALPACA_HISTORY_RESPONSE = {
    "timestamp": [1740787200, 1740873600],  # 2026-03-01, 2026-03-02
    "equity": [103412.5, 104500.0],
    "profit_loss": [3412.5, 1087.5],
    "profit_loss_pct": [3.41, 1.04],
    "base_value": 100000.0,
    "timeframe": "1D",
}

_BROKER_CREDS = {
    "api_key": "FAKE_KEY",
    "api_secret": "FAKE_SECRET",
    "environment": "paper",
}


def _make_supabase_mock(data):
    """Build a Supabase mock that returns the given data from maybe_single().execute()."""
    execute_mock = MagicMock()
    execute_mock.data = data
    maybe_single_mock = MagicMock()
    maybe_single_mock.execute.return_value = execute_mock
    eq_mock = MagicMock()
    eq_mock.maybe_single.return_value = maybe_single_mock
    eq_mock.eq.return_value = eq_mock
    select_mock = MagicMock()
    select_mock.eq.return_value = eq_mock
    table_mock = MagicMock()
    table_mock.select.return_value = select_mock
    sb_mock = MagicMock()
    sb_mock.table.return_value = table_mock
    return sb_mock


def test_equity_curve_returns_date_value_list(client):
    """Happy path: returns list of {date, value} dicts."""
    sb_mock = _make_supabase_mock(_BROKER_CREDS)

    alpaca_response = MagicMock()
    alpaca_response.json.return_value = _ALPACA_HISTORY_RESPONSE
    alpaca_response.raise_for_status = MagicMock()

    async_client_mock = AsyncMock()
    async_client_mock.__aenter__ = AsyncMock(return_value=async_client_mock)
    async_client_mock.__aexit__ = AsyncMock(return_value=None)
    async_client_mock.get = AsyncMock(return_value=alpaca_response)

    with patch("db.supabase.get_supabase", return_value=sb_mock), \
         patch("httpx.AsyncClient", return_value=async_client_mock):
        resp = client.get("/v1/portfolio/equity-curve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
    assert body[0]["date"] == datetime.fromtimestamp(1740787200, tz=timezone.utc).strftime("%Y-%m-%d")
    assert body[0]["value"] == 103412.5
    assert body[1]["value"] == 104500.0
    # Verify shape — no extra keys
    assert set(body[0].keys()) == {"date", "value"}


def test_equity_curve_returns_empty_when_no_broker_connection(client):
    """No broker connection should return empty list with 200."""
    sb_mock = _make_supabase_mock(None)

    with patch("db.supabase.get_supabase", return_value=sb_mock):
        resp = client.get("/v1/portfolio/equity-curve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    assert resp.json() == []


def test_equity_curve_returns_empty_on_alpaca_error(client):
    """Alpaca HTTP error should return empty list (no 500)."""
    sb_mock = _make_supabase_mock(_BROKER_CREDS)

    async_client_mock = AsyncMock()
    async_client_mock.__aenter__ = AsyncMock(return_value=async_client_mock)
    async_client_mock.__aexit__ = AsyncMock(return_value=None)
    async_client_mock.get = AsyncMock(side_effect=Exception("connection refused"))

    with patch("db.supabase.get_supabase", return_value=sb_mock), \
         patch("httpx.AsyncClient", return_value=async_client_mock):
        resp = client.get("/v1/portfolio/equity-curve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    assert resp.json() == []


def test_equity_curve_skips_null_equity_values(client):
    """Null equity entries in Alpaca response should be filtered out."""
    sb_mock = _make_supabase_mock(_BROKER_CREDS)

    response_with_nulls = {
        "timestamp": [1740787200, 1740873600, 1740960000],
        "equity": [103412.5, None, 105000.0],
    }

    alpaca_response = MagicMock()
    alpaca_response.json.return_value = response_with_nulls
    alpaca_response.raise_for_status = MagicMock()

    async_client_mock = AsyncMock()
    async_client_mock.__aenter__ = AsyncMock(return_value=async_client_mock)
    async_client_mock.__aexit__ = AsyncMock(return_value=None)
    async_client_mock.get = AsyncMock(return_value=alpaca_response)

    with patch("db.supabase.get_supabase", return_value=sb_mock), \
         patch("httpx.AsyncClient", return_value=async_client_mock):
        resp = client.get("/v1/portfolio/equity-curve", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["value"] == 103412.5
    assert body[1]["value"] == 105000.0


# ─── Ticker decision log ───────────────────────────────────────────────────────

_TRACE_CREATED = datetime(2026, 3, 20, 10, 32, 0, tzinfo=timezone.utc)

_MONGO_TRACES = [
    {
        "_id": "trace1",
        "user_id": _FAKE_USER,
        "ticker": "AAPL",
        "pipeline_run": {
            "final_decision": {
                "action": "BUY",
                "confidence": 0.94,
                "reasoning": "Breakout confirmed, earnings catalyst",
            }
        },
        "created_at": _TRACE_CREATED,
    },
    {
        "_id": "trace2",
        "user_id": _FAKE_USER,
        "ticker": "AAPL",
        "pipeline_run": {
            "final_decision": {
                "action": "HOLD",
                "confidence": 0.55,
                "reasoning": "Consolidation phase",
            }
        },
        "created_at": _TRACE_CREATED,
    },
]


def _make_mongo_mock(traces: list) -> MagicMock:
    """Build a MongoDB collection mock returning the given traces."""
    cursor_mock = MagicMock()
    cursor_mock.__iter__ = MagicMock(return_value=iter(traces))
    cursor_mock.limit.return_value = iter(traces)

    # find() returns cursor; cursor.limit() returns iterable
    find_result = MagicMock()
    find_result.limit.return_value = iter(traces)

    col_mock = MagicMock()
    col_mock.find.return_value = find_result
    return col_mock


def test_ticker_log_returns_decision_objects(client):
    """Happy path: returns list of action/confidence/reasoning/created_at."""
    col_mock = _make_mongo_mock(_MONGO_TRACES)

    with patch("api.routes.portfolio._get_mongo_collection", return_value=col_mock):
        resp = client.get("/v1/portfolio/positions/AAPL/log", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
    first = body[0]
    assert first["action"] == "BUY"
    assert first["confidence"] == 0.94
    assert first["reasoning"] == "Breakout confirmed, earnings catalyst"
    assert "created_at" in first
    assert set(first.keys()) == {"action", "confidence", "reasoning", "created_at"}


def test_ticker_log_returns_empty_for_unknown_ticker(client):
    """No traces for ticker should return empty list with 200."""
    col_mock = _make_mongo_mock([])

    with patch("api.routes.portfolio._get_mongo_collection", return_value=col_mock):
        resp = client.get(
            "/v1/portfolio/positions/UNKNOWN/log",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert resp.json() == []


def test_ticker_log_respects_limit_param(client):
    """limit query param should be forwarded to MongoDB cursor.limit()."""
    col_mock = _make_mongo_mock(_MONGO_TRACES[:1])

    with patch("api.routes.portfolio._get_mongo_collection", return_value=col_mock):
        resp = client.get(
            "/v1/portfolio/positions/AAPL/log?limit=1",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert len(resp.json()) == 1
    # Verify limit was forwarded to the MongoDB cursor
    col_mock.find.return_value.limit.assert_called_once_with(1)


def test_ticker_log_rejects_limit_above_max(client):
    """limit > 50 should return 422 validation error."""
    resp = client.get(
        "/v1/portfolio/positions/AAPL/log?limit=51",
        headers={"Authorization": "Bearer fake"},
    )
    assert resp.status_code == 422


def test_ticker_log_returns_empty_on_mongo_error(client):
    """MongoDB exception should return empty list (no 500)."""
    col_mock = MagicMock()
    col_mock.find.side_effect = Exception("mongo unavailable")

    with patch("api.routes.portfolio._get_mongo_collection", return_value=col_mock):
        resp = client.get(
            "/v1/portfolio/positions/AAPL/log",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    assert resp.json() == []
