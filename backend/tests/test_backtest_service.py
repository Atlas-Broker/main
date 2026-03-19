# backend/tests/test_backtest_service.py
from unittest.mock import MagicMock, patch


def _sb_mock():
    m = MagicMock()
    m.table.return_value.insert.return_value.execute.return_value = MagicMock()
    m.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    m.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])
    m.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    m.table.return_value.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    return m


def test_create_job_inserts_row_with_correct_shape():
    sb = _sb_mock()
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import create_job
        job_id = create_job("user_1", ["AAPL", "MSFT"], "2026-01-01", "2026-02-01", "conditional")
    payload = sb.table.return_value.insert.call_args[0][0]
    assert payload["user_id"] == "user_1"
    assert payload["tickers"] == ["AAPL", "MSFT"]
    assert payload["ebc_mode"] == "conditional"
    assert payload["status"] == "queued"
    assert payload["initial_capital"] == 10000.0
    assert "id" in payload
    assert job_id == payload["id"]


def test_list_jobs_returns_data():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[{"id": "abc", "status": "completed"}]
    )
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import list_jobs
        result = list_jobs("user_1")
    assert result == [{"id": "abc", "status": "completed"}]


def test_delete_job_returns_false_when_running():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"status": "running", "mongo_id": None}]
    )
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import delete_job
        result = delete_job("job-1", "user_1")
    assert result is False


def test_delete_job_returns_none_when_not_found():
    sb = _sb_mock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    with patch("services.backtest_service.get_supabase", return_value=sb):
        from services.backtest_service import delete_job
        result = delete_job("job-1", "user_1")
    assert result is None
