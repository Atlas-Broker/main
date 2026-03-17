"""Unit tests for portfolio_service using a mocked Supabase client."""

from unittest.mock import MagicMock, patch


class TestGetOrCreatePortfolio:
    def test_upserts_portfolio_for_user(self):
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_upsert = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.upsert.return_value = mock_upsert
        mock_upsert.execute.return_value = MagicMock(data=[{"id": "port_001", "user_id": "user_2test"}])
        with patch("services.portfolio_service.get_supabase_client", return_value=mock_client):
            from services import portfolio_service
            result = portfolio_service.get_or_create_portfolio("user_2test")
        mock_table.upsert.assert_called_once()
        call_args = mock_table.upsert.call_args[0][0]
        assert call_args["user_id"] == "user_2test"

    def test_upsert_is_idempotent(self):
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_upsert = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.upsert.return_value = mock_upsert
        mock_upsert.execute.return_value = MagicMock(data=[{"id": "port_001"}])
        with patch("services.portfolio_service.get_supabase_client", return_value=mock_client):
            from services import portfolio_service
            portfolio_service.get_or_create_portfolio("user_2test")
            portfolio_service.get_or_create_portfolio("user_2test")
        assert mock_table.upsert.call_count == 2

    def test_handles_supabase_error_gracefully(self):
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.side_effect = Exception("DB error")
        with patch("services.portfolio_service.get_supabase_client", return_value=mock_client):
            from services import portfolio_service
            portfolio_service.get_or_create_portfolio("user_fail")
