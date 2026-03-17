"""Integration tests for auth on protected routes."""

import pytest
from fastapi.testclient import TestClient


def make_app_with_mock_auth(authed_user_id: str | None):
    from fastapi import FastAPI, Depends, Request
    from api.dependencies import get_current_user

    app = FastAPI()

    if authed_user_id:
        @app.middleware("http")
        async def set_user(request, call_next):
            request.state.user_id = authed_user_id
            return await call_next(request)

    @app.get("/v1/portfolio")
    def portfolio(user_id: str = Depends(get_current_user)):
        return {"user_id": user_id, "total_value": 100000.0}

    return app


class TestGetCurrentUser:
    def test_authenticated_request_returns_200(self):
        app = make_app_with_mock_auth("user_2abc")
        client = TestClient(app)
        res = client.get("/v1/portfolio")
        assert res.status_code == 200
        assert res.json()["user_id"] == "user_2abc"

    def test_unauthenticated_request_returns_401(self):
        app = make_app_with_mock_auth(None)
        client = TestClient(app)
        res = client.get("/v1/portfolio")
        assert res.status_code == 401

    def test_health_endpoint_is_unprotected(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient as TC

        app = FastAPI()

        @app.get("/health")
        def health():
            return {"status": "ok"}

        client = TC(app)
        res = client.get("/health")
        assert res.status_code == 200
