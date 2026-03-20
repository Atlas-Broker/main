# backend/tests/test_trade_service.py
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import pytest


def _mock_order(qty="10", filled_avg_price="150.00", order_id="alpaca-order-001"):
    return {"qty": qty, "filled_avg_price": filled_avg_price, "order_id": order_id}


def _make_sb_mock(existing_positions=None):
    mock = MagicMock()
    mock.table.return_value.insert.return_value.execute.return_value = MagicMock()
    pos_result = MagicMock()
    pos_result.data = existing_positions if existing_positions is not None else []
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = pos_result
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    return mock


def test_record_trade_inserts_correct_shape():
    mock_sb = _make_sb_mock()
    order = _mock_order()
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services.trade_service import record_trade
        record_trade(
            user_id="user_001", portfolio_id="port-uuid-001", ticker="TSLA",
            action="BUY", boundary_mode="advisory", signal_id="mongo-trace-abc", order=order,
        )
    insert_call = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_call["user_id"] == "user_001"
    assert insert_call["ticker"] == "TSLA"
    assert insert_call["shares"] == 10.0
    assert insert_call["price"] == 150.0
    assert insert_call["status"] == "filled"
    assert insert_call["order_id"] == "alpaca-order-001"
    assert "executed_at" in insert_call


def test_sync_positions_buy_creates_new_position():
    mock_sb = _make_sb_mock(existing_positions=[])
    order = _mock_order(qty="5", filled_avg_price="200.00")
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services.trade_service import sync_positions
        sync_positions("user_001", "port-001", "AAPL", "BUY", order)
    insert_call = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_call["ticker"] == "AAPL"
    assert insert_call["shares"] == 5.0
    assert insert_call["avg_cost"] == 200.0


def test_sync_positions_buy_updates_existing_avg_cost():
    existing = [{"id": "pos-1", "shares": 10.0, "avg_cost": 100.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    order = _mock_order(qty="10", filled_avg_price="120.00")
    import importlib
    from services import trade_service
    importlib.reload(trade_service)
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        trade_service.sync_positions("user_001", "port-001", "MSFT", "BUY", order)
    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 20.0
    assert abs(update_call["avg_cost"] - 110.0) < 0.001


def test_sync_positions_sell_partial_close():
    existing = [{"id": "pos-2", "shares": 20.0, "avg_cost": 110.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    order = _mock_order(qty="5", filled_avg_price="130.00")
    import importlib
    from services import trade_service
    importlib.reload(trade_service)
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        trade_service.sync_positions("user_001", "port-001", "MSFT", "SELL", order)
    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 15.0
    assert "avg_cost" not in update_call
    assert "closed_at" not in update_call


def test_sync_positions_sell_full_close():
    existing = [{"id": "pos-3", "shares": 10.0, "avg_cost": 110.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    order = _mock_order(qty="10", filled_avg_price="130.00")
    import importlib
    from services import trade_service
    importlib.reload(trade_service)
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        trade_service.sync_positions("user_001", "port-001", "MSFT", "SELL", order)
    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 0
    assert "closed_at" in update_call


def test_sync_positions_sell_no_existing_logs_warning(caplog):
    import logging
    import importlib
    from services import trade_service
    importlib.reload(trade_service)
    mock_sb = _make_sb_mock(existing_positions=[])
    order = _mock_order(qty="5")
    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        with caplog.at_level(logging.WARNING, logger="services.trade_service"):
            trade_service.sync_positions("user_001", "port-001", "XYZ", "SELL", order)
    assert "no existing position" in caplog.text.lower()
    mock_sb.table.return_value.update.assert_not_called()
