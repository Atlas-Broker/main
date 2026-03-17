# Supabase Integration Layer Design Spec

> Sprint 2 of 4. Requires Auth (Sprint 1) and database migration to be complete.
> Revised after spec review 2026-03-17.

---

## Overview

Wire all five Supabase tables into live use. Currently the schema is deployed but no backend code reads from or writes to it. This sprint closes that gap.

**Scope:**
1. Trade history — write to `supabase.trades` on every execution
2. Position sync — upsert `supabase.positions` after every trade
3. Mode persistence — `profiles.boundary_mode` read/write via `/v1/profile`
4. Profile route — `GET /v1/profile` and `PATCH /v1/profile` endpoints
5. Portfolio acquisition — `get_or_create_portfolio()` utility used by all write paths

**Access model:** Backend-only via Supabase service key. No JWT bridge. Manual `user_id` filter on every query.

---

## Database dependency

Requires `2026-03-17-database-migration-design.md` to be applied. All `user_id` columns are `TEXT` (Clerk user IDs). `portfolio_id` is `UUID` referencing `portfolios.id`.

---

## Portfolio acquisition

Every trade and position write requires a `portfolio_id`. The strategy:

```python
# backend/services/portfolio_service.py
def get_or_create_portfolio(user_id: str) -> str:
    """Returns portfolio UUID for user. Creates default if none exists."""
    result = supabase.table("portfolios") \
        .select("id").eq("user_id", user_id).limit(1).execute()
    if result.data:
        return result.data[0]["id"]
    new = supabase.table("portfolios") \
        .insert({"user_id": user_id, "name": "Paper Portfolio"}).execute()
    return new.data[0]["id"]
```

Called at the start of `record_trade()` and `sync_positions()`. Also called by the Clerk webhook on user creation so the portfolio exists before the user's first dashboard visit.

---

## Data flows

### Trade execution (approve + execute)

```
POST /v1/signals/{id}/approve
  user_id = get_current_user(request)

  1. Verify signal ownership:
     trace = db.reasoning_traces.find_one({
       "_id": ObjectId(signal_id), "user_id": user_id
     })
     if not trace: raise 404

  2. Idempotency guard:
     if trace.execution.executed: raise 409 "Already executed"

  3. Place order:
     order = broker.place_order(ticker, action, notional)

  4. Resolve portfolio:
     portfolio_id = get_or_create_portfolio(user_id)

  5. Record trade:
     supabase.table("trades").insert({
       "user_id": user_id,
       "portfolio_id": portfolio_id,
       "ticker": ticker,
       "action": action,
       "shares": float(order.qty or 0),
       "price": float(order.filled_avg_price or 0),
       "status": "filled",
       "boundary_mode": boundary_mode,
       "signal_id": signal_id,        # MongoDB trace _id
       "order_id": order.order_id,    # Alpaca order UUID
       "executed_at": now()
     })

  6. Sync position:
     sync_positions(user_id, portfolio_id, ticker, order)

  7. Update MongoDB trace:
     db.reasoning_traces.update_one(
       {"_id": ObjectId(signal_id)},
       {"$set": {"execution.executed": True, "execution.order_id": order.order_id}}
     )

  8. Return ExecutionResult
```

If step 5 or 6 (Supabase write) fails:
- Log the error server-side with full context (user_id, ticker, order_id)
- Do NOT fail the HTTP response — the order did execute, failing here would confuse the user
- Return success with a flag `"supabase_sync": false` in the response body for observability

### Position sync

```python
def sync_positions(user_id: str, portfolio_id: str, ticker: str,
                   action: str, order) -> None:
    """Update positions table after a trade. Handles both BUY and SELL."""
    qty = float(order.qty or 0)
    fill_price = float(order.filled_avg_price or 0)

    existing = supabase.table("positions") \
        .select("*") \
        .eq("portfolio_id", portfolio_id) \
        .eq("ticker", ticker) \
        .execute()

    if action.upper() == "BUY":
        if existing.data:
            pos = existing.data[0]
            new_shares = pos["shares"] + qty
            new_avg = ((pos["shares"] * pos["avg_cost"]) +
                       (qty * fill_price)) / new_shares
            supabase.table("positions").update({
                "shares": new_shares, "avg_cost": new_avg
            }).eq("id", pos["id"]).execute()
        else:
            supabase.table("positions").insert({
                "user_id": user_id, "portfolio_id": portfolio_id,
                "ticker": ticker, "shares": qty, "avg_cost": fill_price,
            }).execute()

    elif action.upper() == "SELL":
        if existing.data:
            pos = existing.data[0]
            new_shares = pos["shares"] - qty
            if new_shares <= 0:
                # Position fully closed
                supabase.table("positions").update({
                    "shares": 0, "closed_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", pos["id"]).execute()
            else:
                # Partial close — avg_cost unchanged on SELL
                supabase.table("positions").update({
                    "shares": new_shares
                }).eq("id", pos["id"]).execute()
        # If no existing position and action is SELL: log warning, skip
        # (can happen if position was closed externally via Alpaca dashboard)
```

### Mode persistence

```
GET /v1/profile
  user_id = get_current_user(request)
  result = supabase.table("profiles").select("*").eq("id", user_id).single()
  if not result.data:
    # Last-resort fallback only — canonical path is the Clerk webhook.
    # This handles webhook delivery failures. Email is unknown here so
    # it is stored as empty string; the webhook upsert will correct it
    # if it fires later. Log a warning so the missing webhook is visible.
    logger.warning("Profile not found for user_id %s — webhook may have missed", user_id)
    supabase.table("profiles").insert({
      "id": user_id, "email": "", "boundary_mode": "advisory",
      "onboarding_completed": False
    })
    return defaults
  return profile

PATCH /v1/profile
  # Pydantic model explicitly restricts writable fields:
  class ProfileUpdate(BaseModel):
      boundary_mode: Literal["advisory", "conditional", "autonomous"] | None = None
      display_name: str | None = None
      # No other fields exposed — id, email, created_at cannot be updated via API

  updates = body.model_dump(exclude_none=True)  # only include provided fields
  if not updates:
    raise HTTPException(422, "No valid fields provided")
  supabase.table("profiles").update(updates).eq("id", user_id).execute()
  return updated profile
```

---

## Backend

### New files

| File | Purpose |
|------|---------|
| `backend/db/supabase.py` | Supabase client singleton (service key, initialised once) |
| `backend/services/trade_service.py` | `record_trade()`, `sync_positions()` |
| `backend/services/portfolio_service.py` | `get_or_create_portfolio()` |
| `backend/services/profile_service.py` | `get_profile()`, `update_profile()`, `create_profile()` |
| `backend/api/routes/profile.py` | `GET /v1/profile`, `PATCH /v1/profile` |

### Modified files

| File | Change |
|------|--------|
| `backend/services/signals_service.py` | Call `record_trade()` + `sync_positions()` after approve; add `get_current_user` dependency to `approve_signal` route; **add `user_id` filter to `get_recent_signals()`** to prevent cross-user data leakage |
| `backend/api/routes/signals.py` | Pass `user_id` from `get_current_user` into `get_recent_signals()` |
| `backend/api/routes/portfolio.py` | Add `get_current_user` dependency |
| `backend/main.py` | Include profile router |

### Supabase client

```python
# backend/db/supabase.py
# supabase-py client, SUPABASE_URL + SUPABASE_SERVICE_KEY
# Service key bypasses RLS — all user isolation is in application code
# Every query that touches user data must include .eq("user_id", user_id)
# get_supabase() → returns singleton (thread-safe after init)
```

---

## Frontend

### Modified files

| File | Change |
|------|--------|
| `app/dashboard/page.tsx` (Settings tab section) | On mount: `GET /v1/profile` → set boundary_mode; on change: `PATCH /v1/profile` |
| `app/dashboard/page.tsx` (Overview tab section) | Display `profile.display_name` in header greeting |

### Settings tab behaviour

```typescript
// On mount
const profile = await fetchWithAuth(`${API_URL}/v1/profile`).then(r => r.json());
setBoundaryMode(profile.boundary_mode);

// On mode change
await fetchWithAuth(`${API_URL}/v1/profile`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ boundary_mode: newMode }),
});
```

---

## Error handling

| Scenario | Response |
|----------|----------|
| Supabase write fails after order placed | Log error server-side; return success with `supabase_sync: false` flag |
| Profile not found on GET | Auto-create with defaults (`boundary_mode: "advisory"`) |
| Invalid boundary_mode on PATCH | 422 — list valid options in detail message |
| Position sync fails | Log warning; Alpaca data still returned; do not fail request |
| Signal not owned by user | 404 (don't leak that it exists) |
| Signal already executed (idempotency) | 409 — "Signal has already been executed" |
| `portfolio_id` creation fails | 500 — logged; cannot safely proceed with trade write |

---

## Testing

| Type | What |
|------|------|
| Unit | `record_trade()` inserts correct row shape including `portfolio_id`, `signal_id`, `order_id` |
| Unit | `sync_positions()` creates new position when none exists |
| Unit | `sync_positions()` correctly recalculates avg_cost on existing position |
| Unit | `get_or_create_portfolio()` returns existing portfolio; creates new when absent |
| Unit | `get_profile()` returns defaults when profile row missing |
| Integration | Approve signal → trade row exists in Supabase with correct user_id |
| Integration | Approve signal twice → 409 on second call |
| Integration | PATCH boundary_mode → GET reflects update |
| Integration | All queries include user_id filter — no cross-user data leakage |
