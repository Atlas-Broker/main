"""
Clerk JWT verification middleware for FastAPI.
"""

import asyncio
import base64
import logging
import os
import time
from typing import Callable

import httpx
from fastapi import HTTPException
from jose import JWTError, jwt as jose_jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)


def _derive_jwks_url() -> str:
    """
    Derive the public JWKS URL from environment variables.

    Priority:
    1. CLERK_JWKS_URL (explicit override)
    2. Derived from CLERK_PUBLISHABLE_KEY — decode the base64 instance domain
       and build the standard /.well-known/jwks.json URL.

    The publishable key format is:
        pk_test_<base64url(instance_domain + "$")>
    e.g. pk_test_ZWxlY3RyaWMtZm94aG91bmQtMjcuY2xlcmsuYWNjb3VudHMuZGV2JA
    decodes to electric-foxhound-27.clerk.accounts.dev$
    """
    explicit = os.getenv("CLERK_JWKS_URL", "")
    if explicit:
        return explicit

    pub_key = os.getenv("CLERK_PUBLISHABLE_KEY", "")
    if pub_key:
        try:
            # Strip the pk_test_ / pk_live_ prefix
            payload = pub_key.split("_", 2)[-1]
            # Pad to a valid base64 length
            padded = payload + "=" * (-len(payload) % 4)
            domain = base64.b64decode(padded).decode().rstrip("$")
            url = f"https://{domain}/.well-known/jwks.json"
            logger.info("Derived CLERK_JWKS_URL from publishable key: %s", url)
            return url
        except Exception as exc:
            logger.warning("Could not derive JWKS URL from publishable key: %s", exc)

    # Last-resort fallback — requires CLERK_SECRET_KEY to be valid.
    return "https://api.clerk.com/v1/jwks"


_ALWAYS_PUBLIC = {"/health", "/webhooks/clerk", "/favicon.ico"}
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
        self._jwks_url = jwks_url or _derive_jwks_url()
        self._jwks_cache = JWKSCache()
        self._refresh_lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        environment = os.getenv("ENVIRONMENT", "development")
        if is_public_path(request.url.path, environment=environment):
            return await call_next(request)

        # Pass CORS preflight requests through — they carry no auth header by design.
        if request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"detail": "Missing Authorization header"}, status_code=401)

        token = auth_header.removeprefix("Bearer ").strip()

        try:
            user_id = await self._verify_token(token)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        except Exception as exc:
            logger.error("Unexpected error during JWT verification: %s", exc)
            return JSONResponse({"detail": "Authentication error"}, status_code=401)

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
                raise RuntimeError("Authentication service unavailable")

    async def _verify_token(self, token: str, leeway: int = 0) -> str:
        await self._ensure_jwks()

        if not self._jwks_cache.keys:
            raise RuntimeError("No JWKS keys available")

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
        raise HTTPException(status_code=401, detail="Invalid or expired token")  # caught by dispatch
