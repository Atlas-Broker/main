"""Unit tests for signals_service.reject_signal."""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import HTTPException

VALID_OID = str(ObjectId())
OWNER_USER = "user_owner"
OTHER_USER = "user_other"


def _make_trace(*, executed=False, rejected=False, order_id=None):
    execution = {}
    if executed:
        execution["executed"] = True
        execution["order_id"] = order_id or "ord_123"
        execution["status"] = "filled"
    if rejected:
        execution["rejected"] = True
        execution["rejected_at"] = "2026-01-01T00:00:00+00:00"
        execution["status"] = "rejected"
    return {
        "_id": ObjectId(VALID_OID),
        "user_id": OWNER_USER,
        "ticker": "AAPL",
        "execution": execution,
    }


def _patch_collection(find_one_return):
    col = MagicMock()
    col.find_one.return_value = find_one_return
    return patch("services.signals_service._get_collection", return_value=col), col


class TestRejectSignalInvalidId:
    def test_invalid_objectid_raises_400(self):
        from services.signals_service import reject_signal
        with pytest.raises(HTTPException) as exc_info:
            reject_signal("not-a-valid-id", OWNER_USER)
        assert exc_info.value.status_code == 400
        assert "Invalid signal ID format" in exc_info.value.detail

    def test_empty_string_raises_400(self):
        from services.signals_service import reject_signal
        with pytest.raises(HTTPException) as exc_info:
            reject_signal("", OWNER_USER)
        assert exc_info.value.status_code == 400


class TestRejectSignalNotFound:
    def test_signal_not_found_raises_404(self):
        from services.signals_service import reject_signal
        ctx, col = _patch_collection(None)
        with ctx:
            with pytest.raises(HTTPException) as exc_info:
                reject_signal(VALID_OID, OWNER_USER)
        assert exc_info.value.status_code == 404
        col.find_one.assert_called_once_with({"_id": ObjectId(VALID_OID), "user_id": OWNER_USER})

    def test_wrong_user_raises_404(self):
        from services.signals_service import reject_signal
        ctx, col = _patch_collection(None)
        with ctx:
            with pytest.raises(HTTPException) as exc_info:
                reject_signal(VALID_OID, OTHER_USER)
        assert exc_info.value.status_code == 404


class TestRejectSignalAlreadyExecuted:
    def test_already_executed_raises_409(self):
        from services.signals_service import reject_signal
        trace = _make_trace(executed=True, order_id="ord_abc")
        ctx, col = _patch_collection(trace)
        with ctx:
            with pytest.raises(HTTPException) as exc_info:
                reject_signal(VALID_OID, OWNER_USER)
        assert exc_info.value.status_code == 409
        assert "already been executed" in exc_info.value.detail


class TestRejectSignalIdempotency:
    def test_double_reject_returns_200_without_overwriting(self):
        from services.signals_service import reject_signal
        trace = _make_trace(rejected=True)
        ctx, col = _patch_collection(trace)
        with ctx:
            result = reject_signal(VALID_OID, OWNER_USER)
        assert result["status"] == "rejected"
        col.update_one.assert_not_called()

    def test_double_reject_preserves_original_rejected_at(self):
        from services.signals_service import reject_signal
        trace = _make_trace(rejected=True)
        ctx, col = _patch_collection(trace)
        with ctx:
            result = reject_signal(VALID_OID, OWNER_USER)
        assert result.get("rejected_at") != "overwritten"


class TestRejectSignalSuccess:
    def test_successful_rejection_returns_correct_shape(self):
        from services.signals_service import reject_signal
        trace = _make_trace()
        ctx, col = _patch_collection(trace)
        with ctx:
            result = reject_signal(VALID_OID, OWNER_USER)
        assert result["signal_id"] == VALID_OID
        assert result["status"] == "rejected"
        assert "message" in result

    def test_update_one_called_with_dot_notation(self):
        from services.signals_service import reject_signal
        trace = _make_trace()
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        col.update_one.assert_called_once()
        update_doc = col.update_one.call_args[0][1]
        set_doc = update_doc["$set"]
        assert "execution.rejected" in set_doc
        assert "execution.rejected_at" in set_doc
        assert "execution.status" in set_doc
        assert "execution" not in set_doc

    def test_dot_notation_preserves_order_id(self):
        from services.signals_service import reject_signal
        trace = _make_trace()
        trace["execution"]["order_id"] = "ord_preserve_me"
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        update_doc = col.update_one.call_args[0][1]
        set_doc = update_doc["$set"]
        assert "execution.order_id" not in set_doc
        assert "execution" not in set_doc

    def test_rejected_at_is_utc_iso_string(self):
        from services.signals_service import reject_signal
        trace = _make_trace()
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        set_doc = col.update_one.call_args[0][1]["$set"]
        rejected_at = set_doc["execution.rejected_at"]
        dt = datetime.fromisoformat(rejected_at)
        assert dt.tzinfo is not None
