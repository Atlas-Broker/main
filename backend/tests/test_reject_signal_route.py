"""Integration tests for POST /v1/signals/{id}/reject."""
import pytest
from unittest.mock import patch, MagicMock
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient
from api.dependencies import get_current_user

VALID_OID = str(ObjectId())
OWNER_USER = "user_owner"


async def _mock_dispatch(self, request, call_next):
    request.state.user_id = OWNER_USER
    return await call_next(request)


@pytest.fixture()
def client():
    from main import app
    app.dependency_overrides[get_current_user] = lambda: OWNER_USER
    with patch("api.middleware.auth.ClerkAuthMiddleware.dispatch", _mock_dispatch):
        yield TestClient(app)
    app.dependency_overrides.clear()


class TestRejectRoute:
    def test_successful_rejection_returns_200(self, client):
        success_payload = {"signal_id": VALID_OID, "status": "rejected", "message": "Signal rejected and logged"}
        with patch("services.signals_service.reject_signal", return_value=success_payload) as mock_svc:
            resp = client.post(f"/v1/signals/{VALID_OID}/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["signal_id"] == VALID_OID
        mock_svc.assert_called_once_with(VALID_OID, OWNER_USER)

    def test_invalid_objectid_returns_400(self, client):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(400, "Invalid signal ID format")):
            resp = client.post("/v1/signals/not-valid/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 400

    def test_signal_not_found_returns_404(self, client):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(404, "Signal not found")):
            resp = client.post(f"/v1/signals/{VALID_OID}/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 404

    def test_already_executed_returns_409(self, client):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(409, "Signal has already been executed")):
            resp = client.post(f"/v1/signals/{VALID_OID}/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 409
        assert "already been executed" in resp.json()["detail"]

    def test_double_reject_returns_200_idempotent(self, client):
        idempotent_payload = {"signal_id": VALID_OID, "status": "rejected", "message": "Signal already rejected"}
        with patch("services.signals_service.reject_signal", return_value=idempotent_payload):
            resp = client.post(f"/v1/signals/{VALID_OID}/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 200

    def test_unauthenticated_returns_401(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient as TC
        from api.routes.signals import router
        mini_app = FastAPI()
        mini_app.include_router(router)
        mini_client = TC(mini_app)
        resp = mini_client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 401

    def test_service_exception_returns_500(self, client):
        with patch("services.signals_service.reject_signal", side_effect=RuntimeError("mongo down")):
            resp = client.post(f"/v1/signals/{VALID_OID}/reject", headers={"Authorization": "Bearer fake"})
        assert resp.status_code == 500
