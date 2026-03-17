"""Unit tests for trade_service.cancel_and_log."""
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
import pytest


def _make_trade(
    trade_id="trade-abc",
    user_id="user-123",
    order_id="order-xyz",
    ticker="AAPL",
    status="filled",
    seconds_ago=60,
):
    executed_at = (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).isoformat()
    return {
        "id": trade_id,
        "user_id": user_id,
        "order_id": order_id,
        "ticker": ticker,
        "status": status,
        "executed_at": executed_at,
    }


def _mock_supabase(trade=None, override_log_raises=False):
    sb = MagicMock()
    # trades.select().eq().eq().single().execute()
    select_exec = MagicMock()
    select_exec.data = trade
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = select_exec
    # override_log.insert().execute()
    if override_log_raises:
        sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB down")
    else:
        sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    # trades.update().eq().eq().execute()
    sb.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock()
    return sb


def test_cancel_and_log_inserts_correct_override_log_shape():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason="test")

    insert_calls = [c for c in mock_sb.table.call_args_list if c.args and c.args[0] == "override_log"]
    assert len(insert_calls) == 1
    inserted = mock_sb.table.return_value.insert.call_args.args[0]
    assert "order_id" in inserted
    assert "ticker" in inserted
    assert "broker_cancel_success" in inserted
    assert "overridden_at" in inserted
    assert "created_at" not in inserted
    assert inserted["broker_cancel_success"] is True
    assert result["success"] is True


def test_cancel_and_log_within_window_succeeds():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True


def test_cancel_and_log_window_expired_raises_409():
    from fastapi import HTTPException
    trade = _make_trade(seconds_ago=400)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        with pytest.raises(HTTPException) as exc_info:
            cancel_and_log("trade-abc", "user-123", reason=None)

    assert exc_info.value.status_code == 409
    assert "5 min" in exc_info.value.detail


def test_cancel_and_log_handles_utc_naive_executed_at():
    trade = _make_trade(seconds_ago=60)
    naive_dt = datetime.fromisoformat(trade["executed_at"]).replace(tzinfo=None)
    trade["executed_at"] = naive_dt.isoformat()
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True


def test_cancel_and_log_broker_exception_logs_failure():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.side_effect = RuntimeError("Alpaca connection refused")

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is False
    insert_calls = [c for c in mock_sb.table.call_args_list if c.args and c.args[0] == "override_log"]
    assert len(insert_calls) == 1
    inserted = mock_sb.table.return_value.insert.call_args.args[0]
    assert inserted["broker_cancel_success"] is False


def test_cancel_and_log_idempotent_already_overridden():
    trade = _make_trade(status="overridden", seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True
    assert "already" in result["message"].lower()
    mock_broker.cancel_order.assert_not_called()


def test_cancel_and_log_trade_not_found_raises_404():
    from fastapi import HTTPException
    mock_sb = _mock_supabase(trade=None)
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        with pytest.raises(HTTPException) as exc_info:
            cancel_and_log("trade-abc", "wrong-user", reason=None)

    assert exc_info.value.status_code == 404


def test_cancel_and_log_override_log_failure_is_non_blocking():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade, override_log_raises=True)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("broker.factory.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True
