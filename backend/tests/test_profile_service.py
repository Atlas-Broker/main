"""Unit tests for profile_service using a mocked Supabase client."""

from unittest.mock import MagicMock, patch

import pytest


def make_supabase_mock():
    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_upsert = MagicMock()

    mock_client.table.return_value = mock_table
    mock_table.upsert.return_value = mock_upsert
    mock_table.select.return_value = mock_upsert
    mock_upsert.eq.return_value = mock_upsert
    mock_upsert.execute.return_value = MagicMock(data=[{"id": "user_2test"}])

    return mock_client, mock_table, mock_upsert


class TestCreateProfile:
    def test_upserts_profile_with_correct_fields(self):
        mock_client, mock_table, mock_upsert = make_supabase_mock()
        with patch("services.profile_service.get_supabase_client", return_value=mock_client):
            from services import profile_service
            profile_service.create_profile(
                user_id="user_2test",
                email="test@example.com",
                display_name="Test User",
            )
        mock_table.upsert.assert_called_once_with({
            "id": "user_2test",
            "email": "test@example.com",
            "display_name": "Test User",
            "boundary_mode": "advisory",
            "onboarding_completed": False,
        })

    def test_create_profile_handles_supabase_error_gracefully(self):
        mock_client = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.side_effect = Exception("DB error")
        with patch("services.profile_service.get_supabase_client", return_value=mock_client):
            from services import profile_service
            profile_service.create_profile(
                user_id="user_fail",
                email="fail@example.com",
                display_name="Fail User",
            )


class TestGetProfile:
    def test_returns_profile_dict_when_found(self):
        mock_client, mock_table, mock_upsert = make_supabase_mock()
        mock_upsert.execute.return_value = MagicMock(data=[{
            "id": "user_2test",
            "email": "test@example.com",
            "display_name": "Test User",
            "boundary_mode": "advisory",
            "onboarding_completed": False,
        }])
        with patch("services.profile_service.get_supabase_client", return_value=mock_client):
            from services import profile_service
            result = profile_service.get_profile("user_2test")
        assert result is not None
        assert result["email"] == "test@example.com"

    def test_returns_none_when_not_found(self):
        mock_client, mock_table, mock_upsert = make_supabase_mock()
        mock_upsert.execute.return_value = MagicMock(data=[])
        with patch("services.profile_service.get_supabase_client", return_value=mock_client):
            from services import profile_service
            result = profile_service.get_profile("user_nonexistent")
        assert result is None
