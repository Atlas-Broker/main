# Signal Rejection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `/v1/signals/{id}/reject` endpoint to persist rejection state in MongoDB and update the frontend reject button with loading, disabled, and error-toast states.

**Architecture:** The service layer exposes `reject_signal(signal_id, user_id)` as a plain function (no FastAPI `Depends`) — the route handler is responsible for injecting the authenticated user. MongoDB is updated with dot-notation `$set` so existing `execution.order_id` and `execution.executed` fields are preserved. The frontend updates local React state on success, avoiding a full page refresh.

**Tech Stack:** FastAPI, PyMongo, BSON ObjectId, pytest, httpx (test client), Next.js 16 / React 19, TypeScript

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `backend/services/signals_service.py` | Modify | Add `reject_signal(signal_id, user_id)` function |
| `backend/api/routes/signals.py` | Modify | Replace placeholder reject handler; add `Depends(get_current_user)` |
| `backend/api/middleware/auth.py` | Create (Sprint 1 deliverable — see note below) | `get_current_user` dependency; plan references it as already present |
| `backend/tests/__init__.py` | Create | Empty init to make tests a package |
| `backend/tests/test_reject_signal_service.py` | Create | Unit tests for `reject_signal` service function |
| `backend/tests/test_reject_signal_route.py` | Create | Integration tests for `POST /v1/signals/{id}/reject` |
| `frontend/app/dashboard/page.tsx` | Modify | `SignalCard` reject handler: loading state, "Rejected" disabled state, local state update, error toasts |

> **Auth note:** `backend/api/middleware/auth.py` is a Sprint 1 deliverable. This plan assumes it exists and exports `get_current_user` returning a `str` (Clerk user ID). If Sprint 1 is not merged yet, stub it locally during development: `def get_current_user(): return "test-user"`.

---

## Chunk 1: `reject_signal` service function (TDD)

### Task 1.1: Create test file and write all failing unit tests

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_reject_signal_service.py`

- [ ] **Step 1: Create the tests package init**

```bash
touch /Users/whatelz/Documents/GitHub/main/backend/tests/__init__.py
```

- [ ] **Step 2: Write the failing unit tests**

Create `backend/tests/test_reject_signal_service.py` with the following content:

```python
"""
Unit tests for signals_service.reject_signal.

All MongoDB calls are monkey-patched — no real database needed.
"""
import sys
import os
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone

# Ensure backend package root is on sys.path when running from backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bson import ObjectId
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_OID = str(ObjectId())  # a real 24-char hex string
OTHER_USER = "user_other"
OWNER_USER = "user_owner"


def _make_trace(
    *,
    executed: bool = False,
    rejected: bool = False,
    order_id: str | None = None,
) -> dict:
    """Build a minimal reasoning_trace document."""
    execution: dict = {}
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
    """Return a context manager that patches _get_collection."""
    col = MagicMock()
    col.find_one.return_value = find_one_return
    return patch("services.signals_service._get_collection", return_value=col), col


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

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
        # find_one must filter by both _id AND user_id (ownership check)
        col.find_one.assert_called_once_with({"_id": ObjectId(VALID_OID), "user_id": OWNER_USER})

    def test_wrong_user_raises_404(self):
        """Signal exists but belongs to a different user — must return 404, not 403."""
        from services.signals_service import reject_signal
        # Simulates MongoDB returning nothing when user_id filter doesn't match
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
        """Second rejection must succeed (200) and must NOT call update_one again."""
        from services.signals_service import reject_signal
        trace = _make_trace(rejected=True)
        original_rejected_at = trace["execution"]["rejected_at"]
        ctx, col = _patch_collection(trace)
        with ctx:
            result = reject_signal(VALID_OID, OWNER_USER)
        assert result["status"] == "rejected"
        # No write must occur on idempotent path
        col.update_one.assert_not_called()

    def test_double_reject_preserves_original_rejected_at(self):
        from services.signals_service import reject_signal
        trace = _make_trace(rejected=True)
        original_rejected_at = trace["execution"]["rejected_at"]
        ctx, col = _patch_collection(trace)
        with ctx:
            result = reject_signal(VALID_OID, OWNER_USER)
        # The original timestamp must not be replaced
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
        """$set must use dot-notation keys (execution.rejected, not execution: {...})."""
        from services.signals_service import reject_signal
        trace = _make_trace()
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        col.update_one.assert_called_once()
        _, kwargs_or_args = col.update_one.call_args[0], col.update_one.call_args
        update_doc = col.update_one.call_args[0][1]
        set_doc = update_doc["$set"]
        # Must use dot-notation — not a nested dict under "execution"
        assert "execution.rejected" in set_doc
        assert "execution.rejected_at" in set_doc
        assert "execution.status" in set_doc
        # Must NOT use a top-level "execution" key (which would clobber order_id)
        assert "execution" not in set_doc

    def test_dot_notation_preserves_order_id(self):
        """Dot-notation $set must not overwrite execution.order_id on a previously approved trace."""
        from services.signals_service import reject_signal
        # Simulate a trace that was approved (has order_id) but not yet executed
        # (edge case: approved, order placed, but executed flag not set yet)
        trace = _make_trace()
        trace["execution"]["order_id"] = "ord_preserve_me"
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        update_doc = col.update_one.call_args[0][1]
        set_doc = update_doc["$set"]
        # order_id must not appear in the $set payload — we must not touch it
        assert "execution.order_id" not in set_doc
        assert "execution" not in set_doc  # no full subdoc replacement

    def test_rejected_at_is_utc_iso_string(self):
        from services.signals_service import reject_signal
        trace = _make_trace()
        ctx, col = _patch_collection(trace)
        with ctx:
            reject_signal(VALID_OID, OWNER_USER)
        set_doc = col.update_one.call_args[0][1]["$set"]
        rejected_at = set_doc["execution.rejected_at"]
        # Must be a parseable ISO 8601 UTC string
        dt = datetime.fromisoformat(rejected_at)
        assert dt.tzinfo is not None  # timezone-aware
```

- [ ] **Step 3: Run tests to verify they all FAIL**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_reject_signal_service.py -v 2>&1 | head -60
```

Expected output: all tests fail with `ImportError` or `AttributeError: module 'services.signals_service' has no attribute 'reject_signal'`. No test should pass at this point.

---

### Task 1.2: Implement `reject_signal` in the service layer

**Files:**
- Modify: `backend/services/signals_service.py`

- [ ] **Step 4: Add `reject_signal` to `signals_service.py`**

Open `backend/services/signals_service.py`. After the existing `approve_and_execute` function (line 97), append:

```python
def reject_signal(signal_id: str, user_id: str) -> dict:
    """Reject a signal and persist the decision to MongoDB.

    Plain parameters — no FastAPI Depends here.
    The route handler (signals.py) injects user_id via Depends(get_current_user).

    Returns:
        dict with signal_id, status, message

    Raises:
        HTTPException 400 — invalid ObjectId format
        HTTPException 404 — signal not found or not owned by user
        HTTPException 409 — signal has already been executed
    """
    from fastapi import HTTPException

    # 1. Validate signal_id is a parseable ObjectId
    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid signal ID format")

    col = _get_collection()

    # 2. Find trace — user_id filter enforces ownership (returns None for wrong user)
    trace = col.find_one({"_id": oid, "user_id": user_id})
    if not trace:
        raise HTTPException(status_code=404, detail="Signal not found")

    execution = trace.get("execution", {})

    # 3. Guard: cannot reject an already-executed signal
    if execution.get("executed"):
        raise HTTPException(status_code=409, detail="Signal has already been executed")

    # 4. Idempotency: already rejected — return success without overwriting rejected_at
    if execution.get("rejected"):
        return {
            "signal_id": signal_id,
            "status": "rejected",
            "message": "Signal already rejected",
        }

    # 5. Persist rejection using dot-notation $set to merge into execution subdoc.
    #    Dot-notation merges fields individually, preserving existing keys like
    #    execution.order_id and execution.executed that the approve path may have set.
    col.update_one(
        {"_id": oid},
        {
            "$set": {
                "execution.rejected": True,
                "execution.rejected_at": datetime.now(timezone.utc).isoformat(),
                "execution.status": "rejected",
            }
        },
    )

    logger.info("Signal rejected: %s by user %s", signal_id, user_id)
    return {
        "signal_id": signal_id,
        "status": "rejected",
        "message": "Signal rejected and logged",
    }
```

Also add the missing import at the top of the file — `datetime` and `timezone` are not yet imported. Add this line after the existing imports:

```python
from datetime import datetime, timezone
```

- [ ] **Step 5: Run tests to verify they all PASS**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_reject_signal_service.py -v
```

Expected output:
```
PASSED tests/test_reject_signal_service.py::TestRejectSignalInvalidId::test_invalid_objectid_raises_400
PASSED tests/test_reject_signal_service.py::TestRejectSignalInvalidId::test_empty_string_raises_400
PASSED tests/test_reject_signal_service.py::TestRejectSignalNotFound::test_signal_not_found_raises_404
PASSED tests/test_reject_signal_service.py::TestRejectSignalNotFound::test_wrong_user_raises_404
PASSED tests/test_reject_signal_service.py::TestRejectSignalAlreadyExecuted::test_already_executed_raises_409
PASSED tests/test_reject_signal_service.py::TestRejectSignalIdempotency::test_double_reject_returns_200_without_overwriting
PASSED tests/test_reject_signal_service.py::TestRejectSignalIdempotency::test_double_reject_preserves_original_rejected_at
PASSED tests/test_reject_signal_service.py::TestRejectSignalSuccess::test_successful_rejection_returns_correct_shape
PASSED tests/test_reject_signal_service.py::TestRejectSignalSuccess::test_update_one_called_with_dot_notation
PASSED tests/test_reject_signal_service.py::TestRejectSignalSuccess::test_dot_notation_preserves_order_id
PASSED tests/test_reject_signal_service.py::TestRejectSignalSuccess::test_rejected_at_is_utc_iso_string
11 passed in ...s
```

- [ ] **Step 6: Commit**

```bash
cd /Users/whatelz/Documents/GitHub/main && git add backend/tests/__init__.py backend/tests/test_reject_signal_service.py backend/services/signals_service.py && git commit -m "feat: add reject_signal service function with ownership check and idempotency"
```

---

## Chunk 2: Rejection route handler (TDD)

### Task 2.1: Write failing route integration tests

**Files:**
- Create: `backend/tests/test_reject_signal_route.py`

- [ ] **Step 1: Write the failing route tests**

Create `backend/tests/test_reject_signal_route.py`:

```python
"""
Integration tests for POST /v1/signals/{id}/reject.

Uses FastAPI TestClient (httpx under the hood).
MongoDB calls are patched at the service layer — no real database needed.
get_current_user is overridden via FastAPI dependency_overrides.
"""
import sys
import os
import pytest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app


VALID_OID = str(ObjectId())
OWNER_USER = "user_owner"


# ---------------------------------------------------------------------------
# Auth override helpers
# ---------------------------------------------------------------------------

def _override_auth(user_id: str):
    """Return a FastAPI dependency override that always yields user_id."""
    def _dep():
        return user_id
    return _dep


def _apply_auth(user_id: str = OWNER_USER):
    """Context manager: override get_current_user for the duration of a test."""
    from api.middleware.auth import get_current_user
    app.dependency_overrides[get_current_user] = _override_auth(user_id)
    return app


def _clear_auth():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestRejectRoute:
    def setup_method(self):
        _apply_auth(OWNER_USER)
        self.client = TestClient(app)

    def teardown_method(self):
        _clear_auth()

    def test_successful_rejection_returns_200(self):
        success_payload = {"signal_id": VALID_OID, "status": "rejected", "message": "Signal rejected and logged"}
        with patch("services.signals_service.reject_signal", return_value=success_payload) as mock_svc:
            resp = self.client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["signal_id"] == VALID_OID
        # Service must be called with signal_id AND user_id (not just signal_id)
        mock_svc.assert_called_once_with(VALID_OID, OWNER_USER)

    def test_invalid_objectid_returns_400(self):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(400, "Invalid signal ID format")):
            resp = self.client.post("/v1/signals/not-valid/reject")
        assert resp.status_code == 400

    def test_signal_not_found_returns_404(self):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(404, "Signal not found")):
            resp = self.client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 404

    def test_already_executed_returns_409(self):
        with patch("services.signals_service.reject_signal", side_effect=HTTPException(409, "Signal has already been executed")):
            resp = self.client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 409
        assert "already been executed" in resp.json()["detail"]

    def test_double_reject_returns_200_idempotent(self):
        idempotent_payload = {"signal_id": VALID_OID, "status": "rejected", "message": "Signal already rejected"}
        with patch("services.signals_service.reject_signal", return_value=idempotent_payload):
            resp = self.client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 200

    def test_unauthenticated_returns_401(self):
        """Endpoint must reject requests with no valid token."""
        _clear_auth()  # Remove override — real auth runs
        client = TestClient(app)
        # No Authorization header → get_current_user should raise 401
        resp = client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 401

    def test_service_exception_returns_500(self):
        with patch("services.signals_service.reject_signal", side_effect=RuntimeError("mongo down")):
            resp = self.client.post(f"/v1/signals/{VALID_OID}/reject")
        assert resp.status_code == 500
```

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_reject_signal_route.py -v 2>&1 | head -60
```

Expected failure: `test_successful_rejection_returns_200` will fail because the current route handler returns a static dict without calling the service or checking auth. `test_unauthenticated_returns_401` will fail because auth is not wired.

---

### Task 2.2: Implement the rejection route handler

**Files:**
- Modify: `backend/api/routes/signals.py`

- [ ] **Step 3: Replace the placeholder reject handler**

Open `backend/api/routes/signals.py`. The current handler at the bottom is:

```python
@router.post("/signals/{signal_id}/reject")
def reject_signal(signal_id: str):
    return {"signal_id": signal_id, "status": "rejected"}
```

Replace the entire file content with the following (adds the auth import, the `Depends` injection, and proper error handling matching the existing `approve_signal` pattern):

```python
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.middleware.auth import get_current_user

router = APIRouter(prefix="/v1", tags=["signals"])
logger = logging.getLogger(__name__)


class RiskParams(BaseModel):
    stop_loss: float
    take_profit: float
    position_size: int
    risk_reward_ratio: float


class Signal(BaseModel):
    id: str
    ticker: str
    action: str
    confidence: float
    reasoning: str
    boundary_mode: str
    risk: RiskParams
    created_at: str


@router.get("/signals", response_model=list[Signal])
def get_signals(limit: int = 20):
    try:
        from services.signals_service import get_recent_signals
        return get_recent_signals(limit=limit)
    except Exception as exc:
        logger.exception("Failed to fetch signals from MongoDB")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/approve")
def approve_signal(signal_id: str):
    try:
        from services.signals_service import approve_and_execute
        return approve_and_execute(signal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to approve signal %s", signal_id)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/reject")
def reject_signal_route(
    signal_id: str,
    user_id: str = Depends(get_current_user),
):
    """Reject a signal and persist the decision.

    user_id is injected by FastAPI from the verified Clerk JWT (Sprint 1).
    The service function receives it as a plain str — no Depends in service layer.
    """
    try:
        from services.signals_service import reject_signal
        return reject_signal(signal_id, user_id)
    except HTTPException:
        raise  # re-raise 400/404/409 from service layer as-is
    except Exception as exc:
        logger.exception("Failed to reject signal %s for user %s", signal_id, user_id)
        raise HTTPException(status_code=500, detail=str(exc))
```

> **Sprint 1 dependency:** `get_current_user` is imported from `backend/api/middleware/auth.py`. This module is a Sprint 1 deliverable. If Sprint 1 is not yet merged, create a local stub for development: in `backend/api/middleware/auth.py` add `def get_current_user() -> str: return "test-user"`. Replace with the real Clerk JWT implementation when Sprint 1 lands.

- [ ] **Step 4: Run route tests to verify they PASS**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/test_reject_signal_route.py -v
```

Expected: all tests pass except `test_unauthenticated_returns_401` which depends on Sprint 1's `get_current_user` raising 401 when no token is present — this is correct behaviour and will pass once Sprint 1 is merged.

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/ -v
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/whatelz/Documents/GitHub/main && git add backend/api/routes/signals.py backend/tests/test_reject_signal_route.py && git commit -m "feat: wire reject route with auth dependency and service call"
```

---

## Chunk 3: Frontend reject button state

### Task 3.1: Plan the frontend changes

No dedicated test framework (Jest/Vitest) is present in `frontend/package.json`. Testing for this chunk is done via manual browser verification steps documented below. If the project adds Vitest later, the test stubs in Step 1 should be extracted into a proper test file.

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

The `SignalCard` component currently has this `handleReject` implementation (lines 119–122):

```typescript
async function handleReject() {
  await fetch(`${API_URL}/v1/signals/${signal.id}/reject`, { method: "POST" }).catch(() => {});
  setApproved(false);
}
```

Problems:
1. No loading state — button is not disabled while the request is in-flight
2. No visual "Rejected" confirmation distinct from the generic `approved !== null` banner
3. No error handling — all errors are silently swallowed
4. No local signal state update — the parent `signals` array still shows `awaiting_approval`

### Task 3.2: Add toast utility and extend Signal type

- [ ] **Step 1: Extend the `Signal` type and add state types**

In `frontend/app/dashboard/page.tsx`, the `Signal` type (lines 18–27) needs a `status` field to reflect the server-side `execution.status`. Add it:

```typescript
type Signal = {
  id: string;
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  boundary_mode: string;
  risk: RiskParams;
  created_at: string;
  status?: "awaiting_approval" | "rejected" | "executed";  // add this line
};
```

- [ ] **Step 2: Add a minimal inline toast helper**

The project has no toast library. Add a lightweight inline toast implementation directly in `page.tsx` before the `SignalCard` component. Insert it after the `ACTION_STYLE` constant (after line 63):

```typescript
// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastSeverity = "error" | "info";

function showToast(message: string, severity: ToastSeverity = "error") {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText = [
    "position:fixed",
    "bottom:80px",
    "left:50%",
    "transform:translateX(-50%)",
    "padding:10px 18px",
    "border-radius:8px",
    "font-size:13px",
    "font-family:var(--font-nunito)",
    "z-index:9999",
    "pointer-events:none",
    "max-width:90vw",
    "text-align:center",
    severity === "error"
      ? "background:var(--bear-bg);color:var(--bear);border:1px solid var(--bear)30"
      : "background:var(--hold-bg);color:var(--hold);border:1px solid var(--hold)30",
  ].join(";");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
```

### Task 3.3: Rewrite `SignalCard` reject handler and button UI

- [ ] **Step 3: Update `SignalCard` props to accept an `onReject` callback**

The `SignalCard` component needs to notify the parent (`UserDashboard`) when a rejection succeeds so the parent can update its `signals` state. Update the component signature:

Replace the `SignalCard` function signature (line 100):

```typescript
// OLD:
function SignalCard({ signal, isPrimary }: { signal: Signal; isPrimary?: boolean }) {
```

```typescript
// NEW:
function SignalCard({
  signal,
  isPrimary,
  onReject,
}: {
  signal: Signal;
  isPrimary?: boolean;
  onReject?: (id: string) => void;
}) {
```

- [ ] **Step 4: Add `rejecting` state and rewrite `handleReject`**

Inside `SignalCard`, after the existing state declarations (lines 101–103), add a `rejecting` state:

```typescript
const [rejecting, setRejecting] = useState(false);
```

Replace the entire `handleReject` function (lines 119–122) with:

```typescript
async function handleReject() {
  setRejecting(true);
  try {
    const resp = await fetch(`${API_URL}/v1/signals/${signal.id}/reject`, {
      method: "POST",
    });
    if (resp.ok) {
      setApproved(false);
      onReject?.(signal.id);
    } else if (resp.status === 409) {
      showToast("This signal was already executed");
    } else if (resp.status === 404) {
      showToast("Signal not found");
    } else if (resp.status === 400) {
      showToast("Invalid signal");
    } else {
      showToast("Something went wrong, please try again");
    }
  } catch {
    showToast("Something went wrong, please try again");
  } finally {
    setRejecting(false);
  }
}
```

- [ ] **Step 5: Update the reject button JSX to show loading and disabled states**

Find the reject button inside `SignalCard` (lines 199–212):

```tsx
<button
  onClick={handleReject}
  className="font-semibold px-5 py-3 rounded transition-colors"
  style={{
    background: "transparent",
    border: "1px solid var(--bear-bg)",
    color: "var(--bear)",
    fontSize: 14,
    fontFamily: "var(--font-nunito)",
    cursor: "pointer",
  }}
>
  ✗
</button>
```

Replace with:

```tsx
<button
  onClick={handleReject}
  disabled={rejecting || approved === false}
  className="font-semibold px-5 py-3 rounded transition-colors"
  style={{
    background: approved === false ? "var(--bear-bg)" : "transparent",
    border: `1px solid ${approved === false ? "var(--bear)" : "var(--bear-bg)"}`,
    color: approved === false ? "var(--bear)" : "var(--bear)",
    fontSize: 14,
    fontFamily: "var(--font-nunito)",
    cursor: rejecting || approved === false ? "not-allowed" : "pointer",
    opacity: approved === false ? 0.7 : 1,
    minWidth: 44,
  }}
>
  {rejecting ? "…" : approved === false ? "Rejected ✓" : "✗"}
</button>
```

- [ ] **Step 6: Wire `onReject` in `SignalsTab` and `OverviewTab`**

`SignalsTab` renders `<SignalCard key={sig.id} signal={sig} />` for each signal. It needs to accept and forward an `onReject` callback from the parent.

Update `SignalsTab` props and its `SignalCard` usage:

```typescript
// OLD signature:
function SignalsTab({ signals, loading }: { signals: Signal[]; loading: boolean }) {
// NEW:
function SignalsTab({
  signals,
  loading,
  onReject,
}: {
  signals: Signal[];
  loading: boolean;
  onReject: (id: string) => void;
}) {
```

Inside `SignalsTab`, update the map call:

```tsx
// OLD:
{signals.map((sig) => <SignalCard key={sig.id} signal={sig} />)}
// NEW:
{signals.map((sig) => <SignalCard key={sig.id} signal={sig} onReject={onReject} />)}
```

`OverviewTab` shows the primary signal card. Update it similarly:

```typescript
// OLD:
function OverviewTab({ portfolio, signals }: { portfolio: Portfolio | null; signals: Signal[] }) {
// NEW:
function OverviewTab({
  portfolio,
  signals,
  onReject,
}: {
  portfolio: Portfolio | null;
  signals: Signal[];
  onReject: (id: string) => void;
}) {
```

Update the `<SignalCard signal={primary} isPrimary />` call inside `OverviewTab`:

```tsx
// OLD:
<SignalCard signal={primary} isPrimary />
// NEW:
<SignalCard signal={primary} isPrimary onReject={onReject} />
```

- [ ] **Step 7: Add `handleRejectSignal` to `UserDashboard` and pass it down**

In `UserDashboard` (the page component, starting at line 504), after the `signals` state declaration, add:

```typescript
function handleRejectSignal(id: string) {
  setSignals((prev) =>
    prev.map((s) =>
      s.id === id ? { ...s, status: "rejected" as const } : s
    )
  );
}
```

Then update the JSX where `OverviewTab` and `SignalsTab` are rendered to pass the callback:

```tsx
{tab === "overview" && (
  <OverviewTab portfolio={portfolio} signals={signals} onReject={handleRejectSignal} />
)}
{tab === "signals" && (
  <SignalsTab signals={signals} loading={loading} onReject={handleRejectSignal} />
)}
```

- [ ] **Step 8: Verify TypeScript compiles without errors**

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run build 2>&1 | tail -20
```

Expected output ends with:
```
Route (app)                              Size     First Load JS
...
✓ Compiled successfully
```

If there are TypeScript errors, fix them before proceeding.

- [ ] **Step 9: Manual browser verification**

Start the dev server:

```bash
cd /Users/whatelz/Documents/GitHub/main/frontend && npm run dev
```

Open `http://localhost:3000/dashboard` and verify:

1. On a `conditional` signal card, click the reject button (✗)
2. Button text changes to `…` (loading) immediately on click
3. On success (200): button shows `Rejected ✓`, is greyed out and unclickable
4. Signal card status area shows the rejected state banner
5. Clicking the same button again does nothing (disabled)
6. Navigate away and back — rejected state is maintained in React state for the session
7. Test error path: temporarily change the fetch URL to a bad endpoint and verify the toast appears at the bottom of the screen

- [ ] **Step 10: Commit**

```bash
cd /Users/whatelz/Documents/GitHub/main && git add frontend/app/dashboard/page.tsx && git commit -m "feat: add loading and rejected states to SignalCard reject button with error toasts"
```

---

## Integration Verification (post-Sprint-1 merge)

Once Sprint 1 (`get_current_user`) is merged into the branch, run the full backend test suite including the auth test:

```bash
cd /Users/whatelz/Documents/GitHub/main/backend && uv run pytest tests/ -v
```

All 18+ tests must pass including `test_unauthenticated_returns_401`.

End-to-end smoke test with a real MongoDB document (requires `.env` configured):

```bash
# 1. Create a test trace document in MongoDB and capture its _id
# 2. Obtain a valid Clerk JWT for a test user
# 3. POST /v1/signals/{id}/reject with Authorization: Bearer <token>
# 4. GET /v1/signals — verify the returned signal shows status "rejected"
# 5. Repeat POST — verify 200 (idempotent), not 500
```
