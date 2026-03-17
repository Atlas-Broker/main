"""
Unit tests for the Clerk JWT verification middleware.
Tests use pre-generated RSA keys so no network calls are made.
"""

import time
from unittest.mock import MagicMock

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
from jose import jwt as jose_jwt
import base64

from fastapi import HTTPException
from starlette.requests import Request
from starlette.datastructures import Headers


@pytest.fixture(scope="module")
def rsa_key_pair():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    return private_key, private_key.public_key()


@pytest.fixture(scope="module")
def mock_jwks(rsa_key_pair):
    private_key, public_key = rsa_key_pair
    pub_numbers = public_key.public_numbers()

    def int_to_base64url(n: int) -> str:
        length = (n.bit_length() + 7) // 8
        data = n.to_bytes(length, byteorder="big")
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    return {
        "keys": [{
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "test-key-id",
            "n": int_to_base64url(pub_numbers.n),
            "e": int_to_base64url(pub_numbers.e),
        }]
    }


def make_token(private_key, payload: dict) -> str:
    from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
    pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    return jose_jwt.encode(payload, pem, algorithm="RS256", headers={"kid": "test-key-id"})


class TestJWKSCache:
    def test_cache_stores_keys(self, mock_jwks):
        from api.middleware.auth import JWKSCache
        cache = JWKSCache()
        cache.update(mock_jwks)
        assert cache.keys is not None
        assert len(cache.keys) > 0

    def test_cache_is_valid_within_ttl(self, mock_jwks):
        from api.middleware.auth import JWKSCache
        cache = JWKSCache()
        cache.update(mock_jwks)
        assert cache.is_valid() is True

    def test_cache_is_invalid_after_ttl(self, mock_jwks):
        from api.middleware.auth import JWKSCache
        cache = JWKSCache(ttl_seconds=0)
        cache.update(mock_jwks)
        time.sleep(0.01)
        assert cache.is_valid() is False

    def test_cache_is_invalid_when_empty(self):
        from api.middleware.auth import JWKSCache
        cache = JWKSCache()
        assert cache.is_valid() is False


class TestVerifyClerkToken:
    @pytest.mark.asyncio
    async def test_valid_token_sets_user_id(self, rsa_key_pair, mock_jwks):
        from api.middleware.auth import ClerkAuthMiddleware
        private_key, _ = rsa_key_pair
        payload = {"sub": "user_2abc123", "exp": int(time.time()) + 3600}
        token = make_token(private_key, payload)
        middleware = ClerkAuthMiddleware(app=MagicMock())
        middleware._jwks_cache.update(mock_jwks)
        user_id = await middleware._verify_token(token)
        assert user_id == "user_2abc123"

    @pytest.mark.asyncio
    async def test_expired_token_raises_401(self, rsa_key_pair, mock_jwks):
        from api.middleware.auth import ClerkAuthMiddleware
        private_key, _ = rsa_key_pair
        payload = {"sub": "user_2abc123", "exp": int(time.time()) - 10}
        token = make_token(private_key, payload)
        middleware = ClerkAuthMiddleware(app=MagicMock())
        middleware._jwks_cache.update(mock_jwks)
        with pytest.raises(HTTPException) as exc_info:
            await middleware._verify_token(token)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_token_raises_401(self, mock_jwks):
        from api.middleware.auth import ClerkAuthMiddleware
        middleware = ClerkAuthMiddleware(app=MagicMock())
        middleware._jwks_cache.update(mock_jwks)
        with pytest.raises(HTTPException) as exc_info:
            await middleware._verify_token("not.a.valid.jwt")
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_token_within_clock_skew_passes(self, rsa_key_pair, mock_jwks):
        from api.middleware.auth import ClerkAuthMiddleware
        private_key, _ = rsa_key_pair
        payload = {"sub": "user_clock", "exp": int(time.time()) - 20}
        token = make_token(private_key, payload)
        middleware = ClerkAuthMiddleware(app=MagicMock())
        middleware._jwks_cache.update(mock_jwks)
        user_id = await middleware._verify_token(token, leeway=30)
        assert user_id == "user_clock"


class TestPublicPathBypass:
    def test_health_is_public(self):
        from api.middleware.auth import is_public_path
        assert is_public_path("/health") is True

    def test_webhooks_is_public(self):
        from api.middleware.auth import is_public_path
        assert is_public_path("/webhooks/clerk") is True

    def test_docs_is_public_in_dev(self):
        from api.middleware.auth import is_public_path
        assert is_public_path("/docs", environment="development") is True

    def test_docs_is_not_public_in_production(self):
        from api.middleware.auth import is_public_path
        assert is_public_path("/docs", environment="production") is False

    def test_portfolio_is_not_public(self):
        from api.middleware.auth import is_public_path
        assert is_public_path("/v1/portfolio") is False
