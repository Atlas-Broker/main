import importlib
import os
import sys
from unittest.mock import MagicMock, patch


def _reload_module():
    if "db.supabase" in sys.modules:
        del sys.modules["db.supabase"]
    return importlib.import_module("db.supabase")


def test_get_supabase_returns_client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")
    mock_client = MagicMock()
    with patch("supabase.create_client", return_value=mock_client) as mock_create:
        mod = _reload_module()
        client = mod.get_supabase()
        assert client is mock_client
        mock_create.assert_called_once_with("https://test.supabase.co", "service-key-test")


def test_get_supabase_is_singleton(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")
    mock_client = MagicMock()
    with patch("supabase.create_client", return_value=mock_client) as mock_create:
        mod = _reload_module()
        c1 = mod.get_supabase()
        c2 = mod.get_supabase()
        assert c1 is c2
        mock_create.assert_called_once()


def test_get_supabase_missing_url_raises(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")
    mod = _reload_module()
    import pytest
    with pytest.raises(KeyError):
        mod.get_supabase()
