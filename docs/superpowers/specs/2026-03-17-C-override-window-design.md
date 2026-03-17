# Override Window Design Spec

> Sprint 3 of 4. Requires Auth (Sprint 1) and Supabase layer (Sprint 2).
> Revised after spec review 2026-03-17.

---

## Overview

Autonomous mode currently executes trades with no emergency brake. This sprint wires `POST /v1/trades/{id}/override` to cancel the Alpaca order and write a full audit record to `supabase.override_log`. The frontend shows a time-limited "Override" button on autonomous-mode positions.

---

## Database dependency

Requires `2026-03-17-database-migration-design.md`. The new `override_log` schema includes `order_id`, `ticker`, `broker_cancel_success`, and `overridden_at`. The `trades` table includes `order_id` (Alpaca order UUID).

---

## Backend

### Layer boundary

The route handler (`trades.py`) is thin: it injects `user_id` via `Depends(get_current_user)`, validates the request body, and calls `trade_service.cancel_and_log(trade_id, user_id, body.reason)`. All business logic (window check, broker call, audit log, status update) lives in `cancel_and_log()` in the service layer. Unit tests target `cancel_and_log()` directly.

### Modified files

| File | Change |
|------|--------|
| `backend/api/routes/trades.py` | Wire `override_trade()` with `get_current_user`; call `trade_service.cancel_and_log()` |
| `backend/services/trade_service.py` | Add `cancel_and_log(trade_id: str, user_id: str, reason: str | None) -> dict` |

### Override flow

```python
# POST /v1/trades/{trade_id}/override
# body: { reason?: str }

class OverrideRequest(BaseModel):
    reason: str | None = None

def override_trade(
    trade_id: str,
    body: OverrideRequest,
    user_id: str = Depends(get_current_user)
):
    # 1. Look up trade — 404 if not found or not owned by user
    result = supabase.table("trades") \
        .select("*") \
        .eq("id", trade_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(404, "Trade not found")
    trade = result.data

    # 2. Idempotency: already overridden
    if trade["status"] == "overridden":
        return {"success": True, "message": "Trade already overridden"}

    # 3. Override window check (UTC-aware)
    from datetime import datetime, timezone
    executed_at = datetime.fromisoformat(trade["executed_at"])
    if executed_at.tzinfo is None:
        executed_at = executed_at.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - executed_at).total_seconds()
    if elapsed > 300:
        raise HTTPException(409, "Override window has closed (5 min limit)")

    # 4. Attempt broker cancellation
    success = False
    try:
        success = broker.cancel_order(trade["order_id"])
    except Exception as exc:
        logger.error("Broker cancel_order raised exception: %s", exc,
                     extra={"trade_id": trade_id, "order_id": trade["order_id"]})
        # success remains False — audit log records the failure

    # 5. Write audit log (always — even on broker failure)
    try:
        supabase.table("override_log").insert({
            "user_id": user_id,
            "trade_id": trade_id,
            "order_id": trade["order_id"],
            "ticker": trade["ticker"],
            "reason": body.reason or "user_initiated",
            "broker_cancel_success": success,
            "overridden_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        # Log but do not fail the request — audit is best-effort here
        # unlike trade records, override_log failure is non-blocking
        logger.error("override_log write failed: %s", exc,
                     extra={"trade_id": trade_id, "user_id": user_id})

    # 6. Update trade status — always "overridden" regardless of broker result
    #    broker_cancel_success in override_log distinguishes the two cases
    #    Include user_id filter as defence-in-depth (ownership already verified in step 1,
    #    but every write must carry the guard to prevent TOCTOU races)
    supabase.table("trades") \
        .update({"status": "overridden"}) \
        .eq("id", trade_id) \
        .eq("user_id", user_id) \
        .execute()

    if success:
        return {"success": True, "message": "Order cancelled successfully"}
    else:
        return {
            "success": False,
            "message": "Override logged but broker could not cancel the order — "
                       "it may have already been filled"
        }
```

---

## Frontend

### Modified files

| File | Change |
|------|--------|
| `app/dashboard/page.tsx` (Positions tab section) | Add Override button with countdown timer for autonomous positions |

### Override button behaviour

```typescript
// Show only for positions where:
//   trade.boundary_mode === "autonomous"
//   AND seconds since trade.executed_at < 300

// Renders as:
//   [Override (4:32 remaining)]  — counts down in real time using setInterval
//   [Override window closed]     — disabled after 300s, greyed out with tooltip

// On click:
//   → confirm dialog: "Cancel this trade? This cannot be undone."
//   → POST /v1/trades/{id}/override
//   → show success or failure toast (both are valid outcomes)
//   → refresh positions list
```

---

## Error handling

| Scenario | Response |
|----------|----------|
| Trade not found or not owned by user | 404 |
| Trade already overridden | 200 (idempotent) |
| Override window expired | 409 — "Override window has closed (5 min limit)" |
| Broker raises exception | Logged server-side; `success: false` returned to client; override_log still written |
| Order already filled (broker returns false) | `success: false` with clear message; override_log records `broker_cancel_success: false` |
| override_log write fails | Logged server-side; does not fail HTTP response |
| Supabase trade status update fails | 500 — logged with full context |

---

## Testing

| Type | What |
|------|------|
| Unit | `cancel_and_log()` inserts correct override_log shape with all new columns |
| Unit | Window check: `executed_at` 60s ago → passes; `executed_at` 400s ago → raises 409 |
| Unit | UTC-aware datetime subtraction does not raise TypeError |
| Unit | Broker raises exception → `success = False`, log entry written, no unhandled 500 |
| Unit | Already-overridden trade → returns 200 without hitting broker |
| Integration | Override within window → trade status = "overridden", override_log row exists |
| Integration | Override outside window → 409 |
| Integration | Trade owned by different user → 404 |
| Integration | Double override → 200 on second call, broker called only once |
