# Override Window Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `POST /v1/trades/{id}/override` to cancel the Alpaca order within a 5-minute window, write a full audit record to Supabase `override_log`, and show a real-time countdown "Override" button on autonomous-mode positions in the dashboard.

**Architecture:** All business logic lives in a new `cancel_and_log()` function in `backend/services/trade_service.py`; the route handler in `backend/api/routes/trades.py` is thin — it injects `user_id` via `Depends(get_current_user)` and delegates immediately. The frontend adds an `OverrideButton` sub-component to the existing `PositionsTab` in `frontend/app/dashboard/page.tsx`, using `setInterval` for the countdown and the existing `fetch`/toast pattern already present in `SignalCard`.

**Tech Stack:** FastAPI, Supabase Python client (`supabase`), `broker.factory.get_broker()`, pytest + `unittest.mock`, React 19, Next.js 16 App Router, Jest + React Testing Library (to be installed)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/services/trade_service.py` | `cancel_and_log()` — window check, broker cancel, audit log, status update |
| Modify | `backend/api/routes/trades.py` | Replace stub `override_trade()` with real handler using `Depends(get_current_user)` |
| Create | `backend/api/deps.py` | `get_current_user()` FastAPI dependency (Sprint 1 output — create stub if not present) |
| Create | `backend/tests/services/test_trade_service.py` | Unit tests for `cancel_and_log()` |
| Create | `backend/tests/routes/test_trades_override.py` | Integration tests for `POST /v1/trades/{id}/override` |
| Modify | `frontend/app/dashboard/page.tsx` | Add `OverrideButton` sub-component + extend `Position` type + wire into `PositionsTab` |
| Create | `frontend/__tests__/OverrideButton.test.tsx` | Jest tests for countdown disable behaviour |

---

## Chunk 1: cancel_and_log service

### Task 1.1: Scaffold test file and write the first failing test — override_log shape

**Files:**
- Create: `backend/tests/__init__.py` (empty, if not present)
- Create: `backend/tests/services/__init__.py` (empty)
- Create: `backend/tests/services/test_trade_service.py`

- [ ] **Step 1: Create test directory scaffolding**

```bash
mkdir -p /path/to/repo/backend/tests/services
touch backend/tests/__init__.py backend/tests/services/__init__.py
```

Run from `backend/` directory. Expected: no output, directories created.

- [ ] **Step 2: Write the first failing test — correct override_log insert shape**

Create `backend/tests/services/test_trade_service.py` with:

```python
"""Unit tests for trade_service.cancel_and_log."""
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, call
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_trade(
    trade_id="trade-abc",
    user_id="user-123",
    order_id="order-xyz",
    ticker="AAPL",
    status="filled",
    seconds_ago=60,
):
    """Return a dict that looks like a Supabase trades row."""
    executed_at = (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).isoformat()
    return {
        "id": trade_id,
        "user_id": user_id,
        "order_id": order_id,
        "ticker": ticker,
        "status": status,
        "executed_at": executed_at,
    }


def _mock_supabase(trade: dict | None = None, override_log_raises=False):
    """
    Return a mock supabase client whose .table() chain returns:
      - trade row on trades.select
      - success on override_log.insert
      - success on trades.update
    """
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


# ---------------------------------------------------------------------------
# Test 1: override_log insert contains required columns
# ---------------------------------------------------------------------------

def test_cancel_and_log_inserts_correct_override_log_shape():
    """cancel_and_log must insert order_id, ticker, broker_cancel_success, overridden_at."""
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason="test")

    # Find the override_log insert call
    insert_calls = [
        c for c in mock_sb.table.call_args_list
        if c.args and c.args[0] == "override_log"
    ]
    assert len(insert_calls) == 1, "Expected exactly one override_log insert"

    inserted = mock_sb.table.return_value.insert.call_args.args[0]
    assert "order_id" in inserted
    assert "ticker" in inserted
    assert "broker_cancel_success" in inserted
    assert "overridden_at" in inserted
    assert "created_at" not in inserted, "override_log must NOT include created_at"
    assert inserted["broker_cancel_success"] is True
    assert result["success"] is True
```

- [ ] **Step 3: Run the test — confirm it fails with ImportError**

```bash
cd backend && uv run pytest tests/services/test_trade_service.py::test_cancel_and_log_inserts_correct_override_log_shape -v
```

Expected output contains: `ModuleNotFoundError: No module named 'services.trade_service'`

---

### Task 1.2: Implement cancel_and_log

**Files:**
- Create: `backend/services/trade_service.py`

- [ ] **Step 1: Create the service file**

Create `backend/services/trade_service.py`:

```python
"""
Trade service — cancel_and_log for the Override Window feature.

All business logic for POST /v1/trades/{id}/override lives here.
The route handler is intentionally thin.
"""
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
logger = logging.getLogger(__name__)


def get_supabase():
    """Return a Supabase client. Imported lazily so tests can patch it."""
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def get_broker():
    """Return the configured broker. Imported lazily so tests can patch it."""
    from broker.factory import get_broker as _get_broker
    return _get_broker()


def cancel_and_log(trade_id: str, user_id: str, reason: str | None) -> dict:
    """
    Cancel a trade within the 5-minute override window.

    Steps:
      1. Look up trade — 404 if not found or not owned by user.
      2. Idempotency: return 200 immediately if already overridden.
      3. Window check: raise 409 if elapsed > 300 s.
      4. Attempt broker cancellation (log exception, never propagate).
      5. Write override_log audit record (always, even on broker failure).
      6. Update trade status to "overridden" (with user_id guard).
      7. Return {"success": bool, "message": str}.
    """
    supabase = get_supabase()

    # 1. Trade lookup with ownership check
    result = (
        supabase.table("trades")
        .select("*")
        .eq("id", trade_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade = result.data

    # 2. Idempotency
    if trade["status"] == "overridden":
        return {"success": True, "message": "Trade already overridden"}

    # 3. Override window check — handle UTC-naive executed_at defensively
    executed_at = datetime.fromisoformat(trade["executed_at"])
    if executed_at.tzinfo is None:
        executed_at = executed_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - executed_at).total_seconds()
    if elapsed > 300:
        raise HTTPException(
            status_code=409,
            detail="Override window has closed (5 min limit)",
        )

    # 4. Attempt broker cancellation
    broker_cancel_success = False
    try:
        broker = get_broker()
        broker_cancel_success = broker.cancel_order(trade["order_id"])
    except Exception as exc:
        logger.error(
            "Broker cancel_order raised exception: %s",
            exc,
            extra={"trade_id": trade_id, "order_id": trade.get("order_id")},
        )
        # broker_cancel_success stays False — recorded in override_log

    # 5. Write audit log — always, even on broker failure; non-blocking
    try:
        supabase.table("override_log").insert(
            {
                "user_id": user_id,
                "trade_id": trade_id,
                "order_id": trade["order_id"],
                "ticker": trade["ticker"],
                "reason": reason or "user_initiated",
                "broker_cancel_success": broker_cancel_success,
                "overridden_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.error(
            "override_log write failed: %s",
            exc,
            extra={"trade_id": trade_id, "user_id": user_id},
        )

    # 6. Update trade status — dual-key guard prevents TOCTOU race
    supabase.table("trades").update({"status": "overridden"}).eq("id", trade_id).eq(
        "user_id", user_id
    ).execute()

    # 7. Return result
    if broker_cancel_success:
        return {"success": True, "message": "Order cancelled successfully"}
    return {
        "success": False,
        "message": (
            "Override logged but broker could not cancel the order — "
            "it may have already been filled"
        ),
    }
```

- [ ] **Step 2: Run the test — confirm it passes**

```bash
cd backend && uv run pytest tests/services/test_trade_service.py::test_cancel_and_log_inserts_correct_override_log_shape -v
```

Expected: `PASSED`

---

### Task 1.3: Window-check tests

**Files:**
- Modify: `backend/tests/services/test_trade_service.py`

- [ ] **Step 1: Add window-check tests**

Append to `backend/tests/services/test_trade_service.py`:

```python
# ---------------------------------------------------------------------------
# Test 2: Window open (60 s ago) → no HTTPException
# ---------------------------------------------------------------------------

def test_cancel_and_log_within_window_succeeds():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True


# ---------------------------------------------------------------------------
# Test 3: Window expired (400 s ago) → HTTPException 409
# ---------------------------------------------------------------------------

def test_cancel_and_log_window_expired_raises_409():
    trade = _make_trade(seconds_ago=400)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        with pytest.raises(HTTPException) as exc_info:
            cancel_and_log("trade-abc", "user-123", reason=None)

    assert exc_info.value.status_code == 409
    assert "5 min" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Test 4: UTC-naive executed_at does not raise TypeError
# ---------------------------------------------------------------------------

def test_cancel_and_log_handles_utc_naive_executed_at():
    """executed_at stored without timezone suffix must not cause TypeError."""
    trade = _make_trade(seconds_ago=60)
    # Strip timezone info to simulate naive ISO string from Supabase
    naive_dt = datetime.fromisoformat(trade["executed_at"]).replace(tzinfo=None)
    trade["executed_at"] = naive_dt.isoformat()

    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True  # No TypeError raised
```

- [ ] **Step 2: Run the new tests — confirm they fail**

```bash
cd backend && uv run pytest tests/services/test_trade_service.py::test_cancel_and_log_within_window_succeeds tests/services/test_trade_service.py::test_cancel_and_log_window_expired_raises_409 tests/services/test_trade_service.py::test_cancel_and_log_handles_utc_naive_executed_at -v
```

Expected: all three `FAILED` (service not yet running from the imported module context — if they pass, that's also acceptable since the implementation is already written; proceed to next step).

- [ ] **Step 3: Run the full service test suite — confirm all pass**

```bash
cd backend && uv run pytest tests/services/test_trade_service.py -v
```

Expected: all tests `PASSED`

---

### Task 1.4: Broker exception and idempotency tests

**Files:**
- Modify: `backend/tests/services/test_trade_service.py`

- [ ] **Step 1: Add broker exception and idempotency tests**

Append to `backend/tests/services/test_trade_service.py`:

```python
# ---------------------------------------------------------------------------
# Test 5: Broker raises exception → success=False, override_log still written
# ---------------------------------------------------------------------------

def test_cancel_and_log_broker_exception_logs_failure():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()
    mock_broker.cancel_order.side_effect = RuntimeError("Alpaca connection refused")

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    # Should return success=False, not raise
    assert result["success"] is False
    assert "broker" in result["message"].lower() or "filled" in result["message"].lower()

    # override_log insert must still have been called
    insert_calls = [
        c for c in mock_sb.table.call_args_list
        if c.args and c.args[0] == "override_log"
    ]
    assert len(insert_calls) == 1
    inserted = mock_sb.table.return_value.insert.call_args.args[0]
    assert inserted["broker_cancel_success"] is False


# ---------------------------------------------------------------------------
# Test 6: Already overridden → returns 200, broker NOT called
# ---------------------------------------------------------------------------

def test_cancel_and_log_idempotent_already_overridden():
    trade = _make_trade(status="overridden", seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade)
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    assert result["success"] is True
    assert "already" in result["message"].lower()
    mock_broker.cancel_order.assert_not_called()


# ---------------------------------------------------------------------------
# Test 7: Trade not found / different user → HTTPException 404
# ---------------------------------------------------------------------------

def test_cancel_and_log_trade_not_found_raises_404():
    mock_sb = _mock_supabase(trade=None)  # no row returned
    mock_broker = MagicMock()

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        with pytest.raises(HTTPException) as exc_info:
            cancel_and_log("trade-abc", "wrong-user", reason=None)

    assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# Test 8: override_log write fails → does not crash the request
# ---------------------------------------------------------------------------

def test_cancel_and_log_override_log_failure_is_non_blocking():
    trade = _make_trade(seconds_ago=60)
    mock_sb = _mock_supabase(trade=trade, override_log_raises=True)
    mock_broker = MagicMock()
    mock_broker.cancel_order.return_value = True

    with patch("services.trade_service.get_supabase", return_value=mock_sb), \
         patch("services.trade_service.get_broker", return_value=mock_broker):
        from services.trade_service import cancel_and_log
        result = cancel_and_log("trade-abc", "user-123", reason=None)

    # Request must succeed even if override_log write threw
    assert result["success"] is True
```

- [ ] **Step 2: Run the full test suite — confirm all 8 tests pass**

```bash
cd backend && uv run pytest tests/services/test_trade_service.py -v
```

Expected:
```
PASSED tests/services/test_trade_service.py::test_cancel_and_log_inserts_correct_override_log_shape
PASSED tests/services/test_trade_service.py::test_cancel_and_log_within_window_succeeds
PASSED tests/services/test_trade_service.py::test_cancel_and_log_window_expired_raises_409
PASSED tests/services/test_trade_service.py::test_cancel_and_log_handles_utc_naive_executed_at
PASSED tests/services/test_trade_service.py::test_cancel_and_log_broker_exception_logs_failure
PASSED tests/services/test_trade_service.py::test_cancel_and_log_idempotent_already_overridden
PASSED tests/services/test_trade_service.py::test_cancel_and_log_trade_not_found_raises_404
PASSED tests/services/test_trade_service.py::test_cancel_and_log_override_log_failure_is_non_blocking

8 passed
```

- [ ] **Step 3: Commit**

```bash
cd backend
git add services/trade_service.py tests/services/__init__.py tests/__init__.py tests/services/test_trade_service.py
git commit -m "feat: add cancel_and_log service with full override window logic"
```

---

## Chunk 2: Override route

### Task 2.1: Ensure get_current_user dependency exists

**Files:**
- Create: `backend/api/deps.py`

The spec assumes Sprint 1 (Auth) is complete. If `backend/api/deps.py` does not already exist, create a stub that the real auth implementation will replace. The route must compile and be importable even in test environments.

- [ ] **Step 1: Check whether deps.py already exists**

```bash
ls backend/api/deps.py 2>/dev/null && echo "EXISTS — skip this task" || echo "MISSING — create stub"
```

- [ ] **Step 2: If MISSING, create the stub**

Create `backend/api/deps.py`:

```python
"""
FastAPI dependencies.

get_current_user: Sprint 1 (Auth) output.
If Sprint 1 is not yet merged, this stub returns a fixed user_id so the
override route is testable in isolation. Replace with real JWT validation
when auth is wired.
"""
import os
from fastapi import Header, HTTPException


def get_current_user(x_user_id: str = Header(...)) -> str:
    """
    Extract user_id from the X-User-Id request header.

    Sprint 1 replaces this with proper Supabase JWT verification.
    For now, any non-empty header value is accepted.
    """
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    return x_user_id
```

- [ ] **Step 3: Commit deps.py if it was created**

```bash
git add backend/api/deps.py
git commit -m "feat: add get_current_user stub dependency for override route"
```

---

### Task 2.2: Write failing route integration test

**Files:**
- Create: `backend/tests/routes/__init__.py` (empty)
- Create: `backend/tests/routes/test_trades_override.py`

- [ ] **Step 1: Create route test directory**

```bash
mkdir -p backend/tests/routes
touch backend/tests/routes/__init__.py
```

- [ ] **Step 2: Write the failing route integration test**

Create `backend/tests/routes/test_trades_override.py`:

```python
"""
Integration tests for POST /v1/trades/{id}/override.

These tests use FastAPI TestClient and mock cancel_and_log at the service
layer so they do not require a live Supabase or Alpaca connection.
"""
from unittest.mock import patch, MagicMock
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


# ---------------------------------------------------------------------------
# Test 1: Override within window → 200 with success:true
# ---------------------------------------------------------------------------

def test_override_trade_success(client):
    with patch(
        "api.routes.trades.trade_service.cancel_and_log",
        return_value={"success": True, "message": "Order cancelled successfully"},
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={"reason": "changed my mind"},
            headers={"X-User-Id": "user-123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "cancelled" in body["message"].lower()


# ---------------------------------------------------------------------------
# Test 2: Window expired → 409
# ---------------------------------------------------------------------------

def test_override_trade_window_expired(client):
    with patch(
        "api.routes.trades.trade_service.cancel_and_log",
        side_effect=HTTPException(status_code=409, detail="Override window has closed (5 min limit)"),
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"X-User-Id": "user-123"},
        )

    assert response.status_code == 409
    assert "5 min" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Test 3: Trade not found / different user → 404
# ---------------------------------------------------------------------------

def test_override_trade_not_found(client):
    with patch(
        "api.routes.trades.trade_service.cancel_and_log",
        side_effect=HTTPException(status_code=404, detail="Trade not found"),
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"X-User-Id": "wrong-user"},
        )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Test 4: Already overridden → 200 (idempotent)
# ---------------------------------------------------------------------------

def test_override_trade_already_overridden(client):
    with patch(
        "api.routes.trades.trade_service.cancel_and_log",
        return_value={"success": True, "message": "Trade already overridden"},
    ):
        response = client.post(
            "/v1/trades/trade-abc/override",
            json={},
            headers={"X-User-Id": "user-123"},
        )

    assert response.status_code == 200
    assert response.json()["success"] is True


# ---------------------------------------------------------------------------
# Test 5: Missing auth header → 422 (FastAPI validation)
# ---------------------------------------------------------------------------

def test_override_trade_missing_auth(client):
    response = client.post("/v1/trades/trade-abc/override", json={})
    # FastAPI returns 422 for missing required header
    assert response.status_code == 422
```

- [ ] **Step 3: Run the tests — confirm they fail**

```bash
cd backend && uv run pytest tests/routes/test_trades_override.py -v
```

Expected: tests fail because `override_trade` is still the stub (no `Depends(get_current_user)`, no service call).

---

### Task 2.3: Implement the override route

**Files:**
- Modify: `backend/api/routes/trades.py`

- [ ] **Step 1: Replace the stub handler**

Replace the entire contents of `backend/api/routes/trades.py` with:

```python
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from services import trade_service

router = APIRouter(prefix="/v1", tags=["trades"])
logger = logging.getLogger(__name__)


class Trade(BaseModel):
    id: str
    ticker: str
    action: str
    shares: float
    price: float
    status: str
    executed_at: str


class OverrideRequest(BaseModel):
    reason: str | None = None


@router.get("/trades", response_model=list[Trade])
def get_trades():
    return [
        Trade(
            id="trd-001",
            ticker="TSLA",
            action="BUY",
            shares=10,
            price=248.50,
            status="filled",
            executed_at="2026-03-10T10:22:00Z",
        ),
        Trade(
            id="trd-002",
            ticker="META",
            action="SELL",
            shares=15,
            price=612.80,
            status="filled",
            executed_at="2026-03-08T15:45:00Z",
        ),
    ]


@router.post("/trades/{trade_id}/override")
def override_trade(
    trade_id: str,
    body: OverrideRequest,
    user_id: str = Depends(get_current_user),
):
    """Cancel a trade within its 5-minute override window."""
    return trade_service.cancel_and_log(trade_id, user_id, body.reason)
```

- [ ] **Step 2: Run the route tests — confirm all pass**

```bash
cd backend && uv run pytest tests/routes/test_trades_override.py -v
```

Expected:
```
PASSED tests/routes/test_trades_override.py::test_override_trade_success
PASSED tests/routes/test_trades_override.py::test_override_trade_window_expired
PASSED tests/routes/test_trades_override.py::test_override_trade_not_found
PASSED tests/routes/test_trades_override.py::test_override_trade_already_overridden
PASSED tests/routes/test_trades_override.py::test_override_trade_missing_auth

5 passed
```

- [ ] **Step 3: Run the full backend test suite**

```bash
cd backend && uv run pytest tests/ -v
```

Expected: all tests pass (13 total across both test files).

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes/trades.py backend/tests/routes/__init__.py backend/tests/routes/test_trades_override.py
git commit -m "feat: wire POST /v1/trades/{id}/override to cancel_and_log service"
```

---

## Chunk 3: Frontend override button

### Task 3.1: Install Jest and React Testing Library

**Files:**
- Modify: `frontend/package.json`

The frontend currently has no test tooling. Jest and React Testing Library must be installed before writing the test.

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest
```

Expected: `package.json` devDependencies updated, no errors.

- [ ] **Step 2: Add Jest config**

Create `frontend/jest.config.ts`:

```typescript
import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterFramework: [],
  setupFilesAfterFramework: [],
};

export default config;
```

Wait — `setupFilesAfterFramework` is not a valid key. Use:

Create `frontend/jest.config.ts`:

```typescript
import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterFramework: [],
};

export default config;
```

Create `frontend/jest.setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

Update `frontend/jest.config.ts` to include the setup file:

```typescript
import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEach: [],
  setupFilesAfterFramework: [],
};

export default config;
```

**Note:** Use this exact `frontend/jest.config.ts`:

```typescript
import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default config;
```

- [ ] **Step 3: Add test script to package.json**

In `frontend/package.json` add `"test": "jest"` to the `scripts` block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "jest"
}
```

- [ ] **Step 4: Verify Jest can run (no tests yet)**

```bash
cd frontend && npm test -- --passWithNoTests
```

Expected: `No tests found, exiting with code 0` (or similar — no failures).

---

### Task 3.2: Write the failing Jest test for OverrideButton countdown

**Files:**
- Create: `frontend/__tests__/OverrideButton.test.tsx`

- [ ] **Step 1: Create test directory and write the countdown test**

```bash
mkdir -p frontend/__tests__
```

Create `frontend/__tests__/OverrideButton.test.tsx`:

```tsx
/**
 * Tests for the OverrideButton component.
 *
 * Key behaviour under test:
 *  - Button is enabled and shows countdown when < 300 s remain
 *  - Button becomes disabled after 300 s (simulated via fake timers)
 *  - Clicking calls POST /v1/trades/{id}/override
 *  - Confirm dialog appears before the fetch
 */
import React from "react";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// We import OverrideButton directly — it will be a named export
// from the dashboard page module, OR a separate file.
// We will create it as a named export in page.tsx and re-export it
// from __tests__ for isolation. For now test the component in isolation
// by importing from its expected path once implemented.
//
// Using dynamic import so the test fails with a clear message before
// the component exists.

describe("OverrideButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Mock window.confirm to return true (user confirms)
    jest.spyOn(window, "confirm").mockReturnValue(true);
    // Mock global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: "Order cancelled successfully" }),
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders countdown text when within 300s window", async () => {
    const { OverrideButton } = await import("../app/dashboard/page");
    const executedAt = new Date(Date.now() - 60_000).toISOString(); // 60s ago

    render(
      <OverrideButton
        tradeId="trade-abc"
        executedAt={executedAt}
        onSuccess={jest.fn()}
      />
    );

    // Should show remaining seconds (~240)
    const button = screen.getByRole("button");
    expect(button).toBeEnabled();
    expect(button.textContent).toMatch(/Override/i);
    // Countdown text should mention remaining time
    expect(button.textContent).toMatch(/\d+:\d+/);
  });

  it("disables the button after 300s have elapsed", async () => {
    const { OverrideButton } = await import("../app/dashboard/page");
    const executedAt = new Date(Date.now() - 60_000).toISOString(); // start at 60s

    render(
      <OverrideButton
        tradeId="trade-abc"
        executedAt={executedAt}
        onSuccess={jest.fn()}
      />
    );

    // Advance timers by 241 seconds (60 + 241 = 301 > 300)
    act(() => {
      jest.advanceTimersByTime(241_000);
    });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.textContent).toMatch(/window closed/i);
  });

  it("calls POST /v1/trades/{id}/override on click after confirmation", async () => {
    const { OverrideButton } = await import("../app/dashboard/page");
    const executedAt = new Date(Date.now() - 60_000).toISOString();
    const onSuccess = jest.fn();

    render(
      <OverrideButton
        tradeId="trade-abc"
        executedAt={executedAt}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/trades/trade-abc/override"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("does not call fetch when user cancels the confirm dialog", async () => {
    const { OverrideButton } = await import("../app/dashboard/page");
    jest.spyOn(window, "confirm").mockReturnValue(false); // user cancels

    const executedAt = new Date(Date.now() - 60_000).toISOString();
    render(
      <OverrideButton
        tradeId="trade-abc"
        executedAt={executedAt}
        onSuccess={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails with import error**

```bash
cd frontend && npm test -- __tests__/OverrideButton.test.tsx
```

Expected output contains: `SyntaxError` or `export 'OverrideButton' (imported as 'OverrideButton') was not found`

---

### Task 3.3: Implement OverrideButton and wire into PositionsTab

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

The `OverrideButton` component must be added as a **named export** so the Jest test can import it in isolation. It must also be used inside `PositionsTab`.

The `Position` type needs two new optional fields: `trade_id`, `executed_at`, and `boundary_mode`. These are nullable because the existing `GET /v1/portfolio` stub does not yet return them — the button simply won't render without them.

- [ ] **Step 1: Extend the Position type**

In `frontend/app/dashboard/page.tsx`, update the `Position` type (currently at line 29):

```typescript
type Position = {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  pnl: number;
  // Override window fields — present on autonomous trades, absent otherwise
  trade_id?: string;
  executed_at?: string;
  boundary_mode?: string;
};
```

- [ ] **Step 2: Add OverrideButton component**

Add the following named export **before** the `PositionsTab` function in `frontend/app/dashboard/page.tsx`:

```typescript
// ─── OverrideButton ───────────────────────────────────────────────────────────

type OverrideButtonProps = {
  tradeId: string;
  executedAt: string;
  onSuccess: () => void;
};

export function OverrideButton({ tradeId, executedAt, onSuccess }: OverrideButtonProps) {
  const WINDOW_MS = 300_000; // 5 minutes

  function getSecondsRemaining(): number {
    const elapsed = Date.now() - new Date(executedAt).getTime();
    return Math.max(0, Math.floor((WINDOW_MS - elapsed) / 1000));
  }

  const [secondsLeft, setSecondsLeft] = useState<number>(getSecondsRemaining);
  const [overriding, setOverriding] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft(getSecondsRemaining());
    }, 1000);
    return () => clearInterval(id);
  }, [executedAt]);

  const expired = secondsLeft <= 0;
  const disabled = expired || overriding || done;

  function formatCountdown(s: number): string {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  }

  async function handleClick() {
    if (!window.confirm("Cancel this trade? This cannot be undone.")) return;
    setOverriding(true);
    try {
      const res = await fetch(`${API_URL}/v1/trades/${tradeId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "user_initiated" }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        onSuccess();
      } else {
        // Broker failure — override was logged but order may be filled
        window.alert(data.message ?? "Override logged; order may have already filled.");
        setDone(true);
        onSuccess();
      }
    } catch {
      window.alert("Network error — could not reach the server.");
    } finally {
      setOverriding(false);
    }
  }

  if (done) {
    return (
      <div style={{
        fontSize: 12,
        color: "var(--ghost)",
        fontFamily: "var(--font-jb)",
        marginTop: 8,
        padding: "6px 10px",
        background: "var(--elevated)",
        borderRadius: 6,
        textAlign: "center",
      }}>
        Override submitted
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={expired ? "Override window has closed" : `${formatCountdown(secondsLeft)} remaining`}
      style={{
        marginTop: 8,
        width: "100%",
        padding: "8px 0",
        borderRadius: 6,
        border: `1px solid ${expired ? "var(--line)" : "var(--bear)"}`,
        background: expired ? "var(--elevated)" : "var(--bear-bg)",
        color: expired ? "var(--ghost)" : "var(--bear)",
        fontSize: 12,
        fontFamily: "var(--font-jb)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !expired ? 0.6 : 1,
      }}
    >
      {overriding
        ? "Cancelling…"
        : expired
          ? "Override window closed"
          : `Override (${formatCountdown(secondsLeft)} remaining)`}
    </button>
  );
}
```

- [ ] **Step 3: Wire OverrideButton into PositionsTab**

In `frontend/app/dashboard/page.tsx`, update the `PositionsTab` function to add a `refreshPortfolio` prop and render `OverrideButton` for eligible positions.

Replace the `PositionsTab` function signature and the return block:

```typescript
function PositionsTab({
  portfolio,
  refreshPortfolio,
}: {
  portfolio: Portfolio | null;
  refreshPortfolio: () => void;
}) {
```

Inside the `portfolio.positions.map(...)` block, after the existing return div's closing content (after the `ConfBar` closing tag), add:

```tsx
{pos.trade_id && pos.executed_at && pos.boundary_mode === "autonomous" && (
  <OverrideButton
    tradeId={pos.trade_id}
    executedAt={pos.executed_at}
    onSuccess={refreshPortfolio}
  />
)}
```

- [ ] **Step 4: Update the PositionsTab call site in the page render**

In the `UserDashboard` component, the existing render call is:
```tsx
{tab === "positions" && <PositionsTab portfolio={portfolio} />}
```

Add a `refreshPortfolio` callback. First, extract the portfolio fetch into a named function at the top of `UserDashboard`:

```typescript
function fetchPortfolio() {
  fetch(`${API_URL}/v1/portfolio`)
    .then((r) => r.json())
    .then(setPortfolio)
    .catch(console.error);
}
```

Then update the render call to:
```tsx
{tab === "positions" && (
  <PositionsTab portfolio={portfolio} refreshPortfolio={fetchPortfolio} />
)}
```

- [ ] **Step 5: Run the Jest tests — confirm all pass**

```bash
cd frontend && npm test -- __tests__/OverrideButton.test.tsx
```

Expected:
```
PASS __tests__/OverrideButton.test.tsx
  OverrideButton
    ✓ renders countdown text when within 300s window
    ✓ disables the button after 300s have elapsed
    ✓ calls POST /v1/trades/{id}/override on click after confirmation
    ✓ does not call fetch when user cancels the confirm dialog

4 tests passed
```

- [ ] **Step 6: Verify Next.js build still passes**

```bash
cd frontend && npm run build
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/dashboard/page.tsx frontend/__tests__/OverrideButton.test.tsx frontend/jest.config.ts frontend/jest.setup.ts frontend/package.json
git commit -m "feat: add OverrideButton with 5-min countdown to autonomous positions"
```

---

## Final verification

- [ ] **Run the full backend test suite one last time**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

Expected: 13 tests pass, 0 failures.

- [ ] **Run the full frontend test suite**

```bash
cd frontend && npm test
```

Expected: 4 tests pass, 0 failures.

- [ ] **Smoke test the override endpoint manually**

```bash
cd backend && uv run uvicorn main:app --reload &
curl -s -X POST http://localhost:8000/v1/trades/trade-abc/override \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-123" \
  -d '{"reason": "smoke test"}'
```

Expected response (trade not in Supabase): `{"detail": "Trade not found"}` with status 404.
This confirms the route is wired, auth header is processed, and the service layer is reached.

- [ ] **Final commit (if any cleanup)**

```bash
git add -p  # review and stage only intentional changes
git commit -m "chore: post-implementation cleanup for override window"
```
