"""
Clerk JWT verification middleware for FastAPI.
"""

import asyncio
import logging
import os
import time
from typing import Callable

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt as jose_jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

_ALWAYS_PUBLIC = {"/health", "/webhooks/clerk"}
_DEV_PUBLIC = {"/docs", "/openapi.json", "/redoc"}


def is_public_path(path: str, environment: str | None = None) -> bool:
    if environment is None:
        environment = os.getenv("ENVIRONMENT", "development")
    if path in _ALWAYS_PUBLIC:
        return True
    if environment != "production" and path in _DEV_PUBLIC:
        return True
    return False


class JWKSCache:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self.keys: list[dict] | None = None
        self._updated_at: float = 0.0
        self._ttl = ttl_seconds

    def update(self, jwks: dict) -> None:
        self.keys = jwks.get("keys", [])
        self._updated_at = time.monotonic()

    def is_valid(self) -> bool:
        if self.keys is None:
            return False
        return (time.monotonic() - self._updated_at) < self._ttl


class ClerkAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, jwks_url: str | None = None) -> None:
        super().__init__(app)
        self._jwks_url = jwks_url or os.getenv(
            "CLERK_JWKS_URL", "https://api.clerk.com/v1/jwks"
        )
        self._jwks_cache = JWKSCache()
        self._refresh_lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        environment = os.getenv("ENVIRONMENT", "development")
        if is_public_path(request.url.path, environment=environment):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing Authorization header")

        token = auth_header.removeprefix("Bearer ").strip()

        try:
            user_id = await self._verify_token(token)
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Unexpected error during JWT verification: %s", exc)
            raise HTTPException(status_code=401, detail="Authentication error")

        request.state.user_id = user_id
        return await call_next(request)

    async def _ensure_jwks(self) -> None:
        if self._jwks_cache.is_valid():
            return
        async with self._refresh_lock:
            if self._jwks_cache.is_valid():
                return
            await self._fetch_jwks()

    async def _fetch_jwks(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self._jwks_url)
                resp.raise_for_status()
                self._jwks_cache.update(resp.json())
                logger.info("JWKS cache refreshed from %s", self._jwks_url)
        except Exception as exc:
            logger.error("Failed to fetch JWKS: %s", exc)
            if not self._jwks_cache.is_valid():
                raise HTTPException(status_code=503, detail="Authentication service unavailable")

    async def _verify_token(self, token: str, leeway: int = 0) -> str:
        await self._ensure_jwks()

        if not self._jwks_cache.keys:
            raise HTTPException(status_code=503, detail="No JWKS keys available")

        last_error: Exception | None = None

        for key_dict in self._jwks_cache.keys:
            try:
                payload = jose_jwt.decode(
                    token,
                    key_dict,
                    algorithms=["RS256"],
                    options={"leeway": leeway},
                )
                user_id = payload.get("sub")
                if not user_id:
                    raise HTTPException(status_code=401, detail="Token missing sub claim")
                return user_id
            except JWTError as exc:
                last_error = exc
                continue

        logger.debug("JWT verification failed: %s", last_error)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
