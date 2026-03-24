# backend/tests/test_profile_service.py
import logging
from unittest.mock import MagicMock, patch
import pytest


def _make_sb_mock(profile_data=None):
    mock = MagicMock()
    result = MagicMock()
    result.data = profile_data
    mock.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = result
    mock.table.return_value.insert.return_value.execute.return_value = MagicMock()
    mock.table.return_value.upsert.return_value.execute.return_value = MagicMock()
    update_result = MagicMock()
    update_result.data = [profile_data] if profile_data else []
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = update_result
    return mock


def test_get_profile_returns_existing():
    mock_sb = _make_sb_mock(
        profile_data={"id": "u1", "boundary_mode": "autonomous", "display_name": "Alice"}
    )
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        from services.profile_service import get_profile
        result = get_profile("u1")
    assert result["boundary_mode"] == "autonomous"
    assert result["display_name"] == "Alice"


def test_get_profile_includes_tier_from_db():
    mock_sb = _make_sb_mock(
        profile_data={"id": "u1", "boundary_mode": "advisory", "display_name": "Alice", "tier": "pro"}
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        result = profile_service.get_profile("u1")
    assert result["tier"] == "pro"


def test_get_profile_defaults_tier_when_missing_from_db():
    mock_sb = _make_sb_mock(
        profile_data={"id": "u1", "boundary_mode": "advisory", "display_name": "Alice"}
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        result = profile_service.get_profile("u1")
    assert result["tier"] == "free"


def test_get_profile_default_row_includes_tier():
    mock_sb = _make_sb_mock(profile_data=None)
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        result = profile_service.get_profile("u_new")
    assert result["tier"] == "free"


def test_get_profile_creates_default_when_missing(caplog):
    mock_sb = _make_sb_mock(profile_data=None)
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        with caplog.at_level(logging.WARNING, logger="services.profile_service"):
            result = profile_service.get_profile("u_missing")
    assert result["boundary_mode"] == "advisory"
    assert "webhook" in caplog.text.lower()
    mock_sb.table.return_value.insert.assert_called_once()
    insert_row = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_row["id"] == "u_missing"
    assert insert_row["boundary_mode"] == "advisory"


def test_update_profile_calls_supabase_update():
    mock_sb = _make_sb_mock(
        profile_data={"id": "u2", "boundary_mode": "advisory", "display_name": "Bob"}
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        profile_service.update_profile("u2", {"boundary_mode": "advisory"})
    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call == {"boundary_mode": "advisory"}
    eq_call = mock_sb.table.return_value.update.return_value.eq.call_args
    assert eq_call[0] == ("id", "u2")


def test_create_profile_upserts_with_correct_fields():
    mock_sb = _make_sb_mock()
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        from services.profile_service import create_profile
        create_profile("u3", "u3@example.com", "User Three")
    upsert_call = mock_sb.table.return_value.upsert.call_args[0][0]
    assert upsert_call["id"] == "u3"
    assert upsert_call["email"] == "u3@example.com"
    assert upsert_call["display_name"] == "User Three"
    assert upsert_call["boundary_mode"] == "advisory"


# --- investment_philosophy tests ---


def test_get_profile_returns_saved_investment_philosophy():
    mock_sb = _make_sb_mock(
        profile_data={
            "id": "u4",
            "boundary_mode": "advisory",
            "display_name": "Dana",
            "investment_philosophy": "buffett",
        }
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        result = profile_service.get_profile("u4")
    assert result["investment_philosophy"] == "buffett"


def test_get_profile_defaults_investment_philosophy_when_missing():
    mock_sb = _make_sb_mock(
        profile_data={"id": "u5", "boundary_mode": "advisory", "display_name": "Eve"}
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        result = profile_service.get_profile("u5")
    assert result["investment_philosophy"] == "balanced"


def test_update_profile_saves_investment_philosophy():
    mock_sb = _make_sb_mock(
        profile_data={
            "id": "u6",
            "boundary_mode": "advisory",
            "display_name": "Frank",
            "investment_philosophy": "soros",
        }
    )
    import importlib
    from services import profile_service
    importlib.reload(profile_service)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        profile_service.update_profile("u6", {"investment_philosophy": "soros"})
    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call == {"investment_philosophy": "soros"}
    eq_call = mock_sb.table.return_value.update.return_value.eq.call_args
    assert eq_call[0] == ("id", "u6")


def test_get_user_philosophy_returns_saved_value():
    mock_sb = MagicMock()
    result = MagicMock()
    result.data = {"investment_philosophy": "lynch"}
    mock_sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = result
    with patch("db.supabase.get_supabase", return_value=mock_sb):
        import importlib
        import db.supabase as supabase_mod
        importlib.reload(supabase_mod)
        with patch("db.supabase.get_supabase", return_value=mock_sb):
            philosophy = supabase_mod.get_user_philosophy("u7")
    assert philosophy == "lynch"


def test_get_user_philosophy_defaults_to_balanced_when_row_missing():
    mock_sb = MagicMock()
    result = MagicMock()
    result.data = None
    mock_sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = result
    with patch("db.supabase.get_supabase", return_value=mock_sb):
        import importlib
        import db.supabase as supabase_mod
        importlib.reload(supabase_mod)
        with patch("db.supabase.get_supabase", return_value=mock_sb):
            philosophy = supabase_mod.get_user_philosophy("u_missing")
    assert philosophy == "balanced"


def test_get_user_philosophy_defaults_to_balanced_on_exception():
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = Exception(
        "DB error"
    )
    with patch("db.supabase.get_supabase", return_value=mock_sb):
        import importlib
        import db.supabase as supabase_mod
        importlib.reload(supabase_mod)
        with patch("db.supabase.get_supabase", return_value=mock_sb):
            philosophy = supabase_mod.get_user_philosophy("u_err")
    assert philosophy == "balanced"
