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


def _make_tier_mock(tier_value):
    mock = MagicMock()
    result = MagicMock()
    result.data = {"tier": tier_value} if tier_value is not None else None
    mock.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = result
    return mock


def test_get_user_tier_returns_pro():
    import db.supabase as supabase_mod
    mock_sb = _make_tier_mock("pro")
    with patch.object(supabase_mod, "get_supabase", return_value=mock_sb):
        result = supabase_mod.get_user_tier("u1")
    assert result == "pro"


def test_get_user_tier_returns_free_when_no_row():
    import db.supabase as supabase_mod
    mock_sb = _make_tier_mock(None)
    with patch.object(supabase_mod, "get_supabase", return_value=mock_sb):
        result = supabase_mod.get_user_tier("u_missing")
    assert result == "free"


def test_get_user_tier_returns_free_on_exception():
    import db.supabase as supabase_mod
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.side_effect = RuntimeError("DB down")
    with patch.object(supabase_mod, "get_supabase", return_value=mock_sb):
        result = supabase_mod.get_user_tier("u_error")
    assert result == "free"


def test_get_user_tier_defaults_free_when_tier_missing_from_row():
    import db.supabase as supabase_mod
    mock = MagicMock()
    result = MagicMock()
    result.data = {}  # row exists but no tier key
    mock.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = result
    with patch.object(supabase_mod, "get_supabase", return_value=mock):
        tier = supabase_mod.get_user_tier("u_no_tier")
    assert tier == "free"
