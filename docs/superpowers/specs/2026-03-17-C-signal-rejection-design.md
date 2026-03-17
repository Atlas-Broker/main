# Signal Rejection Design Spec

> Sprint 4 of 4. Independent — can run in parallel with Sprint 2/3 once Sprint 1 is complete.
> Revised after spec review 2026-03-17.

---

## Overview

The reject endpoint currently returns a placeholder and persists nothing. This sprint wires it to update the MongoDB reasoning trace and return a real confirmation the frontend can display.

---

## Auth dependency

Requires Sprint 1 (Auth). The `get_current_user` dependency is defined in `backend/api/middleware/auth.py` and returns the Clerk user ID from the verified JWT.

---

## Backend

### Layer boundary

`Depends(get_current_user)` is a FastAPI mechanism — it only works in route handlers, not service functions. The service function accepts `user_id: str` as a plain parameter. The route handler injects it and passes it through. This matches the existing `approve_signal` pattern in `signals.py`.

### Modified files

| File | Change |
|------|--------|
| `backend/services/signals_service.py` | Add `reject_signal(signal_id: str, user_id: str) -> dict` — plain parameters, no `Depends` |
| `backend/api/routes/signals.py` | Add route handler that injects `user_id = Depends(get_current_user)` and calls `signals_service.reject_signal(signal_id, user_id)` |

### Rejection flow

```python
# --- signals_service.py (service layer) ---
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timezone

def reject_signal(signal_id: str, user_id: str) -> dict:
    """Plain parameters. No FastAPI Depends here.

    Route handler in signals.py calls:
        user_id = Depends(get_current_user)
        return signals_service.reject_signal(signal_id, user_id)
    """
    # 1. Validate signal_id is a valid ObjectId
    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise HTTPException(400, "Invalid signal ID format")

    # 2. Find trace — 404 if not found or not owned by user
    trace = db.reasoning_traces.find_one({"_id": oid, "user_id": user_id})
    if not trace:
        raise HTTPException(404, "Signal not found")

    # 3. Guard: cannot reject an already-executed signal
    if trace.get("execution", {}).get("executed"):
        raise HTTPException(409, "Signal has already been executed")

    # 4. Idempotency: already rejected — return success without overwriting rejected_at
    if trace.get("execution", {}).get("rejected"):
        return {"signal_id": signal_id, "status": "rejected",
                "message": "Signal already rejected"}

    # 5. Update MongoDB trace (dot-notation to merge, not replace execution subdoc)
    db.reasoning_traces.update_one(
        {"_id": oid},
        {"$set": {
            "execution.rejected": True,
            "execution.rejected_at": datetime.now(timezone.utc).isoformat(),
            "execution.status": "rejected"
        }}
    )
    # Note: dot-notation $set merges into the execution subdoc rather than
    # replacing it. This preserves any existing execution.order_id or
    # execution.executed fields set by the approve path.

    return {
        "signal_id": signal_id,
        "status": "rejected",
        "message": "Signal rejected and logged"
    }
```

---

## Frontend

### Modified files

| File | Change |
|------|--------|
| `app/dashboard/page.tsx` | Update reject button handler in `SignalCard` / `SignalsTab` component |

### Reject button behaviour

```typescript
// Before: click → POST → nothing visible
// After:
//   → button enters loading state (spinner)
//   → on 200: button → "Rejected ✓" (grey, disabled, no hover)
//   → signal card status badge: "awaiting_approval" → "rejected"
//   → update local signals state — no full page refresh needed

// Error states:
//   → 409 (already executed): toast "This signal was already executed"
//   → 400 (bad ID): toast "Invalid signal" (should not happen in practice)
//   → 404: toast "Signal not found"
//   → other: toast "Something went wrong, please try again"
```

---

## Error handling

| Scenario | Response |
|----------|----------|
| Invalid ObjectId format | 400 — "Invalid signal ID format" |
| Signal not found or not owned by user | 404 |
| Signal already executed | 409 — "Signal has already been executed" |
| Signal already rejected | 200 (idempotent — preserves original `rejected_at`) |
| MongoDB write fails | 500 — logged server-side with signal_id and user_id |

---

## Testing

| Type | What |
|------|------|
| Unit | `reject_signal()` sets `execution.rejected`, `execution.rejected_at`, `execution.status` |
| Unit | `reject_signal()` with invalid ObjectId string → 400 |
| Unit | Already-executed signal → 409 |
| Unit | Idempotent: double reject → 200, `rejected_at` not overwritten |
| Unit | Dot-notation `$set` does not clear `execution.order_id` on already-approved trace |
| Integration | Reject → GET /v1/signals shows status "rejected" |
| Integration | Signal owned by different user → 404 |
| Integration | `get_current_user` dependency enforced on reject endpoint |
