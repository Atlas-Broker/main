# backend/tests/test_portfolio_service.py
from unittest.mock import MagicMock, patch
import pytest


def _make_supabase_mock(existing_data=None):
    mock = MagicMock()
    mock.table.return_value.upsert.return_value.execute.return_value = MagicMock()
    select_result = MagicMock()
    select_result.data = existing_data
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = select_result
    return mock


def test_get_or_create_returns_existing_id():
    mock_sb = _make_supabase_mock(existing_data={"id": "uuid-abc-123"})
    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        from services.portfolio_service import get_or_create_portfolio
        result = get_or_create_portfolio("user_clerk_001")
    assert result == "uuid-abc-123"


def test_get_or_create_calls_upsert_before_select():
    mock_sb = _make_supabase_mock(existing_data={"id": "uuid-new-456"})
    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        from services.portfolio_service import get_or_create_portfolio
        get_or_create_portfolio("user_clerk_002")
    mock_sb.table.return_value.upsert.assert_called_once()
    call_kwargs = mock_sb.table.return_value.upsert.call_args
    row = call_kwargs[0][0]
    assert row["user_id"] == "user_clerk_002"
    assert row["name"] == "Paper Portfolio"


def test_get_or_create_raises_on_missing_portfolio():
    mock_sb = _make_supabase_mock(existing_data=None)
    import importlib
    from services import portfolio_service
    importlib.reload(portfolio_service)
    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        with pytest.raises(RuntimeError, match="portfolio"):
            portfolio_service.get_or_create_portfolio("user_clerk_003")
