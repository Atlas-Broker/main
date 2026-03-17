# Supabase Integration Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all five Supabase tables (portfolios, trades, positions, profiles) into live backend use so every trade execution is persisted, positions are kept in sync, and boundary mode is stored and served per-user.

**Architecture:** A `backend/db/supabase.py` singleton provides the service-key client; thin service modules (`portfolio_service`, `trade_service`, `profile_service`) encapsulate all Supabase I/O behind plain Python functions; the existing `signals_service.approve_and_execute` is updated to call those services after placing the Alpaca order; a new profile route handles `GET /PATCH /v1/profile`; the Settings tab in the frontend reads and writes `boundary_mode` via `fetchWithAuth`.

**Tech Stack:** supabase-py 2.x, FastAPI, Pydantic v2, pytest, React Testing Library / Jest, Next.js 15 App Router

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `backend/db/__init__.py` | Package init |
| `backend/db/supabase.py` | `get_supabase()` singleton — service-key client |
| `backend/services/portfolio_service.py` | `get_or_create_portfolio(user_id)` |
| `backend/services/trade_service.py` | `record_trade()`, `sync_positions()` |
| `backend/services/profile_service.py` | `get_profile()`, `update_profile()`, `create_profile()` |
| `backend/api/routes/profile.py` | `GET /v1/profile`, `PATCH /v1/profile` |
| `backend/tests/__init__.py` | Package init |
| `backend/tests/test_portfolio_service.py` | Unit tests for `get_or_create_portfolio` |
| `backend/tests/test_trade_service.py` | Unit tests for `record_trade`, `sync_positions` |
| `backend/tests/test_profile_service.py` | Unit tests for `get_profile`, `update_profile` |
| `backend/tests/test_profile_route.py` | Integration tests for profile endpoints |
| `backend/tests/test_signals_integration.py` | Integration tests for approve path + idempotency |
| `frontend/__tests__/SettingsTab.test.tsx` | Jest/RTL tests for Settings tab profile persistence |

### Modified files

| File | Change |
|------|--------|
| `backend/services/signals_service.py` | Call `record_trade()` + `sync_positions()` in approve path; add `user_id` param + ownership check; add `user_id` filter to `get_recent_signals()` |
| `backend/api/routes/signals.py` | Pass `user_id` from `get_current_user` into `get_recent_signals()` and `approve_and_execute()` |
| `backend/api/routes/portfolio.py` | Add `get_current_user` dependency (no logic change) |
| `backend/main.py` | Include `profile.router` |
| `frontend/app/dashboard/page.tsx` | `SettingsTab`: fetch profile on mount, PATCH on mode change |

---

## Assumptions

- Sprint 1 (Auth) is complete. `get_current_user(request: Request) -> str` is importable from `api.deps` and returns the Clerk `user_id` string. It raises `HTTPException(401)` on missing/invalid token.
- The database migration from `2026-03-17-database-migration-design.md` is applied: `portfolios`, `trades`, `positions`, `profiles` tables exist.
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are in `.env`.
- `frontend/lib/fetchWithAuth.ts` (or equivalent) is available from Sprint 1 and attaches the Clerk session token as `Authorization: Bearer <token>`.

---

## Chunk 1: Supabase client singleton

### Task 1: Create `backend/db/supabase.py`

**Files:**
- Create: `backend/db/__init__.py`
- Create: `backend/db/supabase.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_supabase_client.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/__init__.py` (empty) and `backend/tests/test_supabase_client.py`:

```python
# backend/tests/test_supabase_client.py
import importlib
import os
import sys
from unittest.mock import MagicMock, patch


def _reload_module():
    """Re-import db.supabase after mutating os.environ."""
    if "db.supabase" in sys.modules:
        del sys.modules["db.supabase"]
    return importlib.import_module("db.supabase")


def test_get_supabase_returns_client(monkeypatch):
    """get_supabase() returns a client object (not None)."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")

    mock_client = MagicMock()
    with patch("supabase.create_client", return_value=mock_client) as mock_create:
        mod = _reload_module()
        client = mod.get_supabase()
        assert client is mock_client
        mock_create.assert_called_once_with(
            "https://test.supabase.co", "service-key-test"
        )


def test_get_supabase_is_singleton(monkeypatch):
    """get_supabase() called twice returns the same object."""
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")

    mock_client = MagicMock()
    with patch("supabase.create_client", return_value=mock_client) as mock_create:
        mod = _reload_module()
        c1 = mod.get_supabase()
        c2 = mod.get_supabase()
        assert c1 is c2
        mock_create.assert_called_once()  # only constructed once


def test_get_supabase_missing_url_raises(monkeypatch):
    """get_supabase() raises KeyError when SUPABASE_URL is absent."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key-test")

    mod = _reload_module()
    import pytest
    with pytest.raises(KeyError):
        mod.get_supabase()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_supabase_client.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Create `backend/db/__init__.py` (empty)**

```python
# backend/db/__init__.py
```

- [ ] **Step 4: Implement `backend/db/supabase.py`**

```python
# backend/db/supabase.py
"""
Supabase service-key client singleton.

Uses the service key — RLS is bypassed.
Every query on user data MUST include .eq("user_id", user_id).
"""
import os

from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return the singleton Supabase client, creating it on first call."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_supabase_client.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/db/__init__.py backend/db/supabase.py \
        backend/tests/__init__.py backend/tests/test_supabase_client.py
git commit -m "feat: add Supabase client singleton with service key"
```

---

## Chunk 2: Portfolio service

### Task 2: `get_or_create_portfolio()`

**Files:**
- Create: `backend/services/portfolio_service.py`
- Create: `backend/tests/test_portfolio_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_portfolio_service.py
from unittest.mock import MagicMock, patch

import pytest


def _make_supabase_mock(existing_data=None, upsert_data=None):
    """Build a mock supabase client with chainable table().select()... interface."""
    mock = MagicMock()

    # Configure upsert chain: .table().upsert().execute()
    mock.table.return_value.upsert.return_value.execute.return_value = MagicMock()

    # Configure select chain: .table().select().eq().single().execute()
    select_result = MagicMock()
    select_result.data = existing_data
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = select_result

    return mock


def test_get_or_create_returns_existing_id():
    """Returns portfolio ID when one already exists for the user."""
    mock_sb = _make_supabase_mock(existing_data={"id": "uuid-abc-123"})

    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        from services.portfolio_service import get_or_create_portfolio
        result = get_or_create_portfolio("user_clerk_001")

    assert result == "uuid-abc-123"


def test_get_or_create_calls_upsert_before_select():
    """upsert is called so concurrent calls are race-condition safe."""
    mock_sb = _make_supabase_mock(existing_data={"id": "uuid-new-456"})

    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        from services.portfolio_service import get_or_create_portfolio
        get_or_create_portfolio("user_clerk_002")

    # The upsert must have been called
    mock_sb.table.return_value.upsert.assert_called_once()
    call_kwargs = mock_sb.table.return_value.upsert.call_args
    row = call_kwargs[0][0]  # first positional arg = the dict
    assert row["user_id"] == "user_clerk_002"
    assert row["name"] == "Paper Portfolio"


def test_get_or_create_raises_on_missing_portfolio():
    """Raises RuntimeError if select returns None (Supabase row missing after upsert)."""
    mock_sb = _make_supabase_mock(existing_data=None)

    with patch("services.portfolio_service.get_supabase", return_value=mock_sb):
        from services import portfolio_service
        import importlib
        importlib.reload(portfolio_service)
        with pytest.raises(RuntimeError, match="portfolio"):
            portfolio_service.get_or_create_portfolio("user_clerk_003")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_portfolio_service.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'services.portfolio_service'`

- [ ] **Step 3: Implement `backend/services/portfolio_service.py`**

```python
# backend/services/portfolio_service.py
"""
Portfolio acquisition helper.

get_or_create_portfolio(user_id) → portfolio UUID string.
Uses upsert-then-select so concurrent first-trade calls are safe.
"""
import logging

from db.supabase import get_supabase

logger = logging.getLogger(__name__)


def get_or_create_portfolio(user_id: str) -> str:
    """
    Return the portfolio UUID for `user_id`.
    Creates a default 'Paper Portfolio' row if none exists.
    Raises RuntimeError if the row cannot be retrieved after upsert.
    """
    sb = get_supabase()

    sb.table("portfolios").upsert(
        {"user_id": user_id, "name": "Paper Portfolio"},
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()

    result = (
        sb.table("portfolios")
        .select("id")
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise RuntimeError(
            f"Failed to resolve portfolio for user {user_id!r} after upsert"
        )

    return result.data["id"]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_portfolio_service.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/portfolio_service.py \
        backend/tests/test_portfolio_service.py
git commit -m "feat: add get_or_create_portfolio with race-condition-safe upsert"
```

---

## Chunk 3: Trade service

### Task 3: `record_trade()` and `sync_positions()`

**Files:**
- Create: `backend/services/trade_service.py`
- Create: `backend/tests/test_trade_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_trade_service.py
"""
Unit tests for trade_service.record_trade and sync_positions.
All Supabase calls are mocked — no real network.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock, call, patch

import pytest


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mock_order(qty="10", filled_avg_price="150.00", order_id="alpaca-order-001"):
    return {"qty": qty, "filled_avg_price": filled_avg_price, "order_id": order_id}


def _make_sb_mock(existing_positions=None):
    mock = MagicMock()
    # .table("trades").insert(...).execute()
    mock.table.return_value.insert.return_value.execute.return_value = MagicMock()
    # .table("positions").select("*").eq().eq().execute()
    pos_result = MagicMock()
    pos_result.data = existing_positions if existing_positions is not None else []
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = pos_result
    # .table("positions").update(...).eq(...).execute()
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    return mock


# ── record_trade ──────────────────────────────────────────────────────────────

def test_record_trade_inserts_correct_shape():
    """record_trade inserts a row with all required columns."""
    mock_sb = _make_sb_mock()
    order = _mock_order()

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services.trade_service import record_trade
        record_trade(
            user_id="user_001",
            portfolio_id="port-uuid-001",
            ticker="TSLA",
            action="BUY",
            boundary_mode="conditional",
            signal_id="mongo-trace-abc",
            order=order,
        )

    insert_call = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_call["user_id"] == "user_001"
    assert insert_call["portfolio_id"] == "port-uuid-001"
    assert insert_call["ticker"] == "TSLA"
    assert insert_call["action"] == "BUY"
    assert insert_call["shares"] == 10.0
    assert insert_call["price"] == 150.0
    assert insert_call["status"] == "filled"
    assert insert_call["boundary_mode"] == "conditional"
    assert insert_call["signal_id"] == "mongo-trace-abc"
    assert insert_call["order_id"] == "alpaca-order-001"
    assert "executed_at" in insert_call


# ── sync_positions — BUY ──────────────────────────────────────────────────────

def test_sync_positions_buy_creates_new_position():
    """BUY with no existing position inserts a new row."""
    mock_sb = _make_sb_mock(existing_positions=[])
    order = _mock_order(qty="5", filled_avg_price="200.00")

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services.trade_service import sync_positions
        sync_positions("user_001", "port-001", "AAPL", "BUY", order)

    insert_call = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_call["ticker"] == "AAPL"
    assert insert_call["shares"] == 5.0
    assert insert_call["avg_cost"] == 200.0
    assert insert_call["user_id"] == "user_001"
    assert insert_call["portfolio_id"] == "port-001"


def test_sync_positions_buy_updates_existing_avg_cost():
    """BUY on existing position recalculates weighted avg_cost."""
    existing = [{"id": "pos-1", "shares": 10.0, "avg_cost": 100.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    # Buying 10 more @ 120 → new avg = (10*100 + 10*120) / 20 = 110.0
    order = _mock_order(qty="10", filled_avg_price="120.00")

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services import trade_service
        import importlib; importlib.reload(trade_service)
        trade_service.sync_positions("user_001", "port-001", "MSFT", "BUY", order)

    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 20.0
    assert abs(update_call["avg_cost"] - 110.0) < 0.001


# ── sync_positions — SELL ─────────────────────────────────────────────────────

def test_sync_positions_sell_partial_close():
    """SELL partial — shares decrease, avg_cost unchanged."""
    existing = [{"id": "pos-2", "shares": 20.0, "avg_cost": 110.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    order = _mock_order(qty="5", filled_avg_price="130.00")

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services import trade_service
        import importlib; importlib.reload(trade_service)
        trade_service.sync_positions("user_001", "port-001", "MSFT", "SELL", order)

    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 15.0
    assert "avg_cost" not in update_call  # avg_cost NOT updated on SELL
    assert "closed_at" not in update_call


def test_sync_positions_sell_full_close():
    """SELL all shares — sets shares=0 and closed_at."""
    existing = [{"id": "pos-3", "shares": 10.0, "avg_cost": 110.0}]
    mock_sb = _make_sb_mock(existing_positions=existing)
    order = _mock_order(qty="10", filled_avg_price="130.00")

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services import trade_service
        import importlib; importlib.reload(trade_service)
        trade_service.sync_positions("user_001", "port-001", "MSFT", "SELL", order)

    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call["shares"] == 0
    assert "closed_at" in update_call


def test_sync_positions_sell_no_existing_logs_warning(caplog):
    """SELL with no existing position logs a warning and does not raise."""
    import logging
    mock_sb = _make_sb_mock(existing_positions=[])
    order = _mock_order(qty="5")

    with patch("services.trade_service.get_supabase", return_value=mock_sb):
        from services import trade_service
        import importlib; importlib.reload(trade_service)
        with caplog.at_level(logging.WARNING, logger="services.trade_service"):
            trade_service.sync_positions("user_001", "port-001", "XYZ", "SELL", order)

    assert "no existing position" in caplog.text.lower()
    mock_sb.table.return_value.update.assert_not_called()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_trade_service.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'services.trade_service'`

- [ ] **Step 3: Implement `backend/services/trade_service.py`**

```python
# backend/services/trade_service.py
"""
Trade persistence and position sync.

record_trade()    — insert a row into supabase.trades
sync_positions()  — upsert supabase.positions after a BUY or SELL
"""
import logging
from datetime import datetime, timezone

from db.supabase import get_supabase

logger = logging.getLogger(__name__)


def record_trade(
    *,
    user_id: str,
    portfolio_id: str,
    ticker: str,
    action: str,
    boundary_mode: str,
    signal_id: str,
    order: dict,
) -> None:
    """Insert one row into the trades table."""
    sb = get_supabase()
    sb.table("trades").insert(
        {
            "user_id": user_id,
            "portfolio_id": portfolio_id,
            "ticker": ticker,
            "action": action,
            "shares": float(order.get("qty") or 0),
            "price": float(order.get("filled_avg_price") or 0),
            "status": "filled",
            "boundary_mode": boundary_mode,
            "signal_id": signal_id,
            "order_id": order.get("order_id"),
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def sync_positions(
    user_id: str,
    portfolio_id: str,
    ticker: str,
    action: str,
    order: dict,
) -> None:
    """
    Update the positions table after a trade.
    BUY  → create new row or update avg_cost + shares.
    SELL → reduce shares; set closed_at if fully closed.
    No-op (with warning) if SELL and no open position found.
    """
    sb = get_supabase()
    qty = float(order.get("qty") or 0)
    fill_price = float(order.get("filled_avg_price") or 0)

    existing = (
        sb.table("positions")
        .select("*")
        .eq("portfolio_id", portfolio_id)
        .eq("ticker", ticker)
        .execute()
    )

    if action.upper() == "BUY":
        if existing.data:
            pos = existing.data[0]
            new_shares = pos["shares"] + qty
            new_avg = (
                (pos["shares"] * pos["avg_cost"]) + (qty * fill_price)
            ) / new_shares
            sb.table("positions").update(
                {"shares": new_shares, "avg_cost": new_avg}
            ).eq("id", pos["id"]).execute()
        else:
            sb.table("positions").insert(
                {
                    "user_id": user_id,
                    "portfolio_id": portfolio_id,
                    "ticker": ticker,
                    "shares": qty,
                    "avg_cost": fill_price,
                }
            ).execute()

    elif action.upper() == "SELL":
        if not existing.data:
            logger.warning(
                "sync_positions: no existing position for %s/%s — "
                "may have been closed externally. Skipping.",
                user_id,
                ticker,
            )
            return

        pos = existing.data[0]
        new_shares = pos["shares"] - qty

        if new_shares <= 0:
            sb.table("positions").update(
                {
                    "shares": 0,
                    "closed_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", pos["id"]).execute()
        else:
            sb.table("positions").update(
                {"shares": new_shares}
            ).eq("id", pos["id"]).execute()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_trade_service.py -v
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/trade_service.py \
        backend/tests/test_trade_service.py
git commit -m "feat: add record_trade and sync_positions with BUY/SELL/partial-close logic"
```

---

## Chunk 4: Profile service and profile route

### Task 4: `get_profile()`, `update_profile()`, `create_profile()`

**Files:**
- Create: `backend/services/profile_service.py`
- Create: `backend/tests/test_profile_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_profile_service.py
import logging
from unittest.mock import MagicMock, patch

import pytest


def _make_sb_mock(profile_data=None):
    mock = MagicMock()
    # select single
    result = MagicMock()
    result.data = profile_data
    mock.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = result
    # insert
    mock.table.return_value.insert.return_value.execute.return_value = MagicMock()
    # update
    update_result = MagicMock()
    update_result.data = [profile_data] if profile_data else []
    mock.table.return_value.update.return_value.eq.return_value.execute.return_value = update_result
    return mock


def test_get_profile_returns_existing():
    """get_profile returns the profile row when found."""
    mock_sb = _make_sb_mock(
        profile_data={"id": "u1", "boundary_mode": "autonomous", "display_name": "Alice"}
    )
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        from services.profile_service import get_profile
        result = get_profile("u1")

    assert result["boundary_mode"] == "autonomous"
    assert result["display_name"] == "Alice"


def test_get_profile_creates_default_when_missing(caplog):
    """get_profile auto-creates a row with advisory defaults when none exists."""
    mock_sb = _make_sb_mock(profile_data=None)
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        from services import profile_service
        import importlib; importlib.reload(profile_service)
        with caplog.at_level(logging.WARNING, logger="services.profile_service"):
            result = profile_service.get_profile("u_missing")

    assert result["boundary_mode"] == "advisory"
    assert "webhook" in caplog.text.lower()
    # fallback insert must have been called
    mock_sb.table.return_value.insert.assert_called_once()
    insert_row = mock_sb.table.return_value.insert.call_args[0][0]
    assert insert_row["id"] == "u_missing"
    assert insert_row["boundary_mode"] == "advisory"


def test_update_profile_calls_supabase_update():
    """update_profile sends only the provided fields to Supabase."""
    mock_sb = _make_sb_mock(
        profile_data={"id": "u2", "boundary_mode": "conditional", "display_name": "Bob"}
    )
    with patch("services.profile_service.get_supabase", return_value=mock_sb):
        from services import profile_service
        import importlib; importlib.reload(profile_service)
        profile_service.update_profile("u2", {"boundary_mode": "advisory"})

    update_call = mock_sb.table.return_value.update.call_args[0][0]
    assert update_call == {"boundary_mode": "advisory"}
    # eq filter must target the right user
    eq_call = mock_sb.table.return_value.update.return_value.eq.call_args
    assert eq_call[0] == ("id", "u2")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_profile_service.py -v
```

Expected: `FAILED` — `ModuleNotFoundError: No module named 'services.profile_service'`

- [ ] **Step 3: Implement `backend/services/profile_service.py`**

```python
# backend/services/profile_service.py
"""
User profile service.

get_profile(user_id)              → dict (creates defaults if row missing)
update_profile(user_id, updates)  → None
"""
import logging

from db.supabase import get_supabase

logger = logging.getLogger(__name__)

_DEFAULTS = {
    "boundary_mode": "advisory",
    "display_name": None,
    "onboarding_completed": False,
}


def get_profile(user_id: str) -> dict:
    """
    Return the profile for user_id.
    If the row is missing (webhook delivery failure), auto-create with advisory
    defaults and log a warning so the missing webhook is visible in logs.
    """
    sb = get_supabase()
    result = (
        sb.table("profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if result.data:
        return result.data

    logger.warning(
        "Profile not found for user_id %r — Clerk webhook may have missed this user. "
        "Auto-creating with advisory defaults.",
        user_id,
    )
    sb.table("profiles").insert(
        {
            "id": user_id,
            "email": "",
            "boundary_mode": "advisory",
            "onboarding_completed": False,
        }
    ).execute()

    return {"id": user_id, **_DEFAULTS}


def update_profile(user_id: str, updates: dict) -> None:
    """Apply `updates` dict to the profile row for user_id."""
    sb = get_supabase()
    sb.table("profiles").update(updates).eq("id", user_id).execute()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_profile_service.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/services/profile_service.py \
        backend/tests/test_profile_service.py
git commit -m "feat: add profile service with auto-create fallback on missing webhook"
```

### Task 5: Profile route `GET /v1/profile` + `PATCH /v1/profile`

**Files:**
- Create: `backend/api/routes/profile.py`
- Create: `backend/tests/test_profile_route.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_profile_route.py
"""
Integration tests for GET /v1/profile and PATCH /v1/profile.
Uses FastAPI TestClient; mocks get_current_user and profile_service.
"""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


_FAKE_USER = "user_clerk_test_001"
_FAKE_PROFILE = {
    "id": _FAKE_USER,
    "boundary_mode": "conditional",
    "display_name": "Test User",
    "email": "test@example.com",
    "onboarding_completed": False,
}


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


def _auth_headers():
    return {"Authorization": "Bearer fake-token"}


def test_get_profile_returns_profile(client):
    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch(
            "services.profile_service.get_profile", return_value=_FAKE_PROFILE
        ),
    ):
        resp = client.get("/v1/profile", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["boundary_mode"] == "conditional"
    assert data["id"] == _FAKE_USER


def test_patch_profile_updates_boundary_mode(client):
    updated = {**_FAKE_PROFILE, "boundary_mode": "advisory"}
    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.profile_service.update_profile") as mock_update,
        patch(
            "services.profile_service.get_profile", return_value=updated
        ),
    ):
        resp = client.patch(
            "/v1/profile",
            json={"boundary_mode": "advisory"},
            headers=_auth_headers(),
        )
    assert resp.status_code == 200
    mock_update.assert_called_once_with(_FAKE_USER, {"boundary_mode": "advisory"})
    assert resp.json()["boundary_mode"] == "advisory"


def test_patch_profile_rejects_invalid_mode(client):
    with patch("api.deps.get_current_user", return_value=_FAKE_USER):
        resp = client.patch(
            "/v1/profile",
            json={"boundary_mode": "yolo"},
            headers=_auth_headers(),
        )
    assert resp.status_code == 422


def test_patch_profile_empty_body_returns_422(client):
    with patch("api.deps.get_current_user", return_value=_FAKE_USER):
        resp = client.patch("/v1/profile", json={}, headers=_auth_headers())
    assert resp.status_code == 422


def test_get_profile_no_auth_returns_401(client):
    resp = client.get("/v1/profile")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_profile_route.py -v
```

Expected: `FAILED` — route not registered / `ModuleNotFoundError`

- [ ] **Step 3: Implement `backend/api/routes/profile.py`**

```python
# backend/api/routes/profile.py
"""
GET  /v1/profile  — return the current user's profile
PATCH /v1/profile — update boundary_mode or display_name
"""
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.deps import get_current_user
from services.profile_service import get_profile, update_profile

router = APIRouter(prefix="/v1", tags=["profile"])
logger = logging.getLogger(__name__)


class ProfileUpdate(BaseModel):
    """Only these two fields are writable via the API."""
    boundary_mode: Literal["advisory", "conditional", "autonomous"] | None = None
    display_name: str | None = None


@router.get("/profile")
def read_profile(user_id: str = Depends(get_current_user)):
    return get_profile(user_id)


@router.patch("/profile")
def patch_profile(
    body: ProfileUpdate,
    user_id: str = Depends(get_current_user),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=422,
            detail="No valid fields provided. Writable fields: boundary_mode, display_name.",
        )
    update_profile(user_id, updates)
    return get_profile(user_id)
```

- [ ] **Step 4: Register the profile router in `backend/main.py`**

Add the import and `app.include_router` call. The diff is minimal — add two lines:

```python
# In backend/main.py, add to the existing imports:
from api.routes import signals, portfolio, trades, pipeline, profile

# Add after the existing include_router calls:
app.include_router(profile.router)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_profile_route.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/api/routes/profile.py \
        backend/main.py \
        backend/tests/test_profile_route.py
git commit -m "feat: add GET/PATCH /v1/profile endpoints with boundary_mode persistence"
```

---

## Chunk 5: Wire approve_and_execute + user_id isolation

### Task 6: Update `signals_service.py` and `signals.py`

**Files:**
- Modify: `backend/services/signals_service.py`
- Modify: `backend/api/routes/signals.py`
- Create: `backend/tests/test_signals_integration.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_signals_integration.py
"""
Integration tests for the approve_and_execute path:
- Supabase writes happen after successful order placement
- Ownership check: signal not owned by user → 404
- Idempotency: second approve → 409
- Supabase write failure does NOT fail the HTTP response
- get_recent_signals filters by user_id
"""
from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient


_FAKE_USER = "user_test_abc"


def _fake_trace(executed=False, user_id=_FAKE_USER):
    return {
        "_id": ObjectId(),
        "user_id": user_id,
        "ticker": "TSLA",
        "boundary_mode": "conditional",
        "pipeline_run": {
            "final_decision": {"action": "BUY", "confidence": 0.85, "reasoning": "strong momentum"},
            "risk": {"stop_loss": 240, "take_profit": 270, "position_size": 10, "risk_reward_ratio": 2.0},
        },
        "created_at": "2026-03-17T10:00:00",
        "execution": {"executed": executed, "order_id": "ord-123" if executed else None},
    }


@pytest.fixture()
def client():
    from main import app
    return TestClient(app)


def test_approve_returns_executed_and_writes_to_supabase(client):
    """Successful approve: order placed and trade recorded in Supabase."""
    trace = _fake_trace()
    signal_id = str(trace["_id"])

    fake_order = {"order_id": "alpaca-001", "qty": "10", "filled_avg_price": "248.50"}

    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.signals_service._get_collection") as mock_col_fn,
        patch("services.signals_service.get_or_create_portfolio", return_value="port-uuid-001"),
        patch("services.signals_service.record_trade") as mock_record,
        patch("services.signals_service.sync_positions") as mock_sync,
        patch("broker.factory.get_broker") as mock_broker_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col

        mock_broker = MagicMock()
        mock_broker.place_order.return_value = fake_order
        mock_broker_fn.return_value = mock_broker

        resp = client.post(
            f"/v1/signals/{signal_id}/approve",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "executed"
    mock_record.assert_called_once()
    mock_sync.assert_called_once()


def test_approve_wrong_user_returns_404(client):
    """Signal owned by different user returns 404 (do not reveal existence)."""
    trace = _fake_trace(user_id="other_user")
    signal_id = str(trace["_id"])

    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.signals_service._get_collection") as mock_col_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col

        resp = client.post(
            f"/v1/signals/{signal_id}/approve",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 404


def test_approve_already_executed_returns_409(client):
    """Second approve on an already-executed signal returns 409."""
    trace = _fake_trace(executed=True)
    signal_id = str(trace["_id"])

    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.signals_service._get_collection") as mock_col_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col

        resp = client.post(
            f"/v1/signals/{signal_id}/approve",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 409
    assert "already" in resp.json()["detail"].lower()


def test_approve_supabase_failure_still_returns_success(client):
    """If Supabase write fails after order, HTTP still returns 200 with supabase_sync=false."""
    trace = _fake_trace()
    signal_id = str(trace["_id"])

    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.signals_service._get_collection") as mock_col_fn,
        patch("services.signals_service.get_or_create_portfolio", side_effect=RuntimeError("DB down")),
        patch("broker.factory.get_broker") as mock_broker_fn,
    ):
        mock_col = MagicMock()
        mock_col.find_one.return_value = trace
        mock_col_fn.return_value = mock_col

        mock_broker = MagicMock()
        mock_broker.place_order.return_value = {"order_id": "ord-002", "qty": "10", "filled_avg_price": "250.00"}
        mock_broker_fn.return_value = mock_broker

        resp = client.post(
            f"/v1/signals/{signal_id}/approve",
            headers={"Authorization": "Bearer fake"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "executed"
    assert data.get("supabase_sync") is False


def test_get_signals_filters_by_user_id(client):
    """GET /v1/signals only returns signals for the authenticated user."""
    traces = [
        {
            "_id": ObjectId(),
            "user_id": _FAKE_USER,
            "ticker": "AAPL",
            "pipeline_run": {"final_decision": {"action": "BUY", "confidence": 0.9, "reasoning": "r"}, "risk": {}},
            "boundary_mode": "advisory",
            "created_at": "2026-03-17T10:00:00",
        }
    ]
    with (
        patch("api.deps.get_current_user", return_value=_FAKE_USER),
        patch("services.signals_service._get_collection") as mock_col_fn,
    ):
        mock_col = MagicMock()
        mock_col.find.return_value.__iter__ = lambda s: iter(traces)
        mock_col.find.return_value.limit.return_value = traces
        mock_col_fn.return_value = mock_col

        resp = client.get("/v1/signals", headers={"Authorization": "Bearer fake"})

    assert resp.status_code == 200
    # Verify find was called with user_id filter
    find_call = mock_col.find.call_args
    query_filter = find_call[0][0] if find_call[0] else find_call[1].get("filter", {})
    assert query_filter.get("user_id") == _FAKE_USER
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_signals_integration.py -v
```

Expected: multiple failures — ownership check missing, 409 not raised, Supabase calls absent.

- [ ] **Step 3: Update `backend/services/signals_service.py`**

Replace the existing file with the updated version below. Key changes:
- `get_recent_signals` accepts `user_id` and filters the MongoDB query.
- `approve_and_execute` accepts `user_id`, checks ownership, raises `PermissionError` on mismatch, raises `AlreadyExecutedError` on duplicate, calls `record_trade` + `sync_positions` in a try/except that sets `supabase_sync=False` on failure.

```python
# backend/services/signals_service.py
"""
Signals service — queries MongoDB for real pipeline traces and executes approvals.
"""
import logging
import os

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from pymongo import MongoClient, DESCENDING

load_dotenv()
logger = logging.getLogger(__name__)

_client: MongoClient | None = None


class AlreadyExecutedError(Exception):
    """Raised when a signal has already been executed."""


def _get_collection():
    global _client
    if _client is None:
        uri = os.environ["MONGODB_URI"]
        _client = MongoClient(uri)
    return _client[os.environ.get("MONGODB_DB_NAME", "atlas")]["reasoning_traces"]


def _trace_to_signal(trace: dict) -> dict:
    decision = trace.get("pipeline_run", {}).get("final_decision", {})
    risk = trace.get("pipeline_run", {}).get("risk", {})
    created = trace.get("created_at", "")
    return {
        "id": str(trace["_id"]),
        "ticker": trace.get("ticker", "UNKNOWN"),
        "action": decision.get("action", "HOLD"),
        "confidence": float(decision.get("confidence", 0.0)),
        "reasoning": decision.get("reasoning", ""),
        "boundary_mode": trace.get("boundary_mode", "advisory"),
        "risk": {
            "stop_loss": float(risk.get("stop_loss", 0)),
            "take_profit": float(risk.get("take_profit", 0)),
            "position_size": int(risk.get("position_size", 0)),
            "risk_reward_ratio": float(risk.get("risk_reward_ratio", 0)),
        },
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


def get_recent_signals(user_id: str, limit: int = 20) -> list[dict]:
    """Return recent signals for the given user only."""
    col = _get_collection()
    traces = list(
        col.find({"user_id": user_id}, sort=[("created_at", DESCENDING)]).limit(limit)
    )
    return [_trace_to_signal(t) for t in traces]


def approve_and_execute(signal_id: str, user_id: str) -> dict:
    """
    Look up trace by ID, verify ownership, place the order, then persist to Supabase.

    Raises:
        ValueError       — invalid signal_id or not found
        PermissionError  — signal belongs to a different user
        AlreadyExecutedError — signal was already executed
    """
    try:
        oid = ObjectId(signal_id)
    except InvalidId:
        raise ValueError(f"Invalid signal_id: {signal_id!r}")

    col = _get_collection()
    trace = col.find_one({"_id": oid})

    if not trace:
        raise ValueError(f"Signal {signal_id} not found")

    # Ownership check — 404 to caller (don't reveal existence to wrong user)
    if trace.get("user_id") != user_id:
        raise ValueError(f"Signal {signal_id} not found")

    # Idempotency guard
    if trace.get("execution", {}).get("executed"):
        raise AlreadyExecutedError("Signal has already been executed.")

    decision = trace.get("pipeline_run", {}).get("final_decision", {})
    ticker = trace.get("ticker", "")
    action = decision.get("action", "HOLD")
    boundary_mode = trace.get("boundary_mode", "advisory")

    if action == "HOLD":
        return {"status": "skipped", "message": "HOLD signal — no order placed."}

    from broker.factory import get_broker
    broker = get_broker()
    order = broker.place_order(ticker, action, notional=1000.0)

    # Persist to Supabase — failure must not fail the HTTP response
    supabase_sync = True
    try:
        from services.portfolio_service import get_or_create_portfolio
        from services.trade_service import record_trade, sync_positions

        portfolio_id = get_or_create_portfolio(user_id)
        record_trade(
            user_id=user_id,
            portfolio_id=portfolio_id,
            ticker=ticker,
            action=action,
            boundary_mode=boundary_mode,
            signal_id=signal_id,
            order=order,
        )
        sync_positions(user_id, portfolio_id, ticker, action, order)
    except Exception as exc:
        logger.error(
            "Supabase write failed after order placement — "
            "user=%r ticker=%r order_id=%r error=%r",
            user_id,
            ticker,
            order.get("order_id"),
            exc,
        )
        supabase_sync = False

    col.update_one(
        {"_id": oid},
        {"$set": {"execution": {"executed": True, "order_id": order["order_id"], "status": "filled"}}},
    )

    logger.info("Approved and executed: %s %s → order %s", action, ticker, order["order_id"])

    result = {
        "status": "executed",
        "order_id": order["order_id"],
        "ticker": ticker,
        "action": action,
        "message": f"Order placed: {action} $1000 of {ticker}.",
        "supabase_sync": supabase_sync,
    }
    return result
```

- [ ] **Step 4: Update `backend/api/routes/signals.py`**

Pass `user_id` from `get_current_user` into both service calls and map `AlreadyExecutedError` to 409:

```python
# backend/api/routes/signals.py
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.deps import get_current_user

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
def get_signals(limit: int = 20, user_id: str = Depends(get_current_user)):
    try:
        from services.signals_service import get_recent_signals
        return get_recent_signals(user_id=user_id, limit=limit)
    except Exception as exc:
        logger.exception("Failed to fetch signals from MongoDB")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/approve")
def approve_signal(signal_id: str, user_id: str = Depends(get_current_user)):
    try:
        from services.signals_service import approve_and_execute, AlreadyExecutedError
        return approve_and_execute(signal_id=signal_id, user_id=user_id)
    except AlreadyExecutedError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to approve signal %s", signal_id)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/signals/{signal_id}/reject")
def reject_signal(signal_id: str, user_id: str = Depends(get_current_user)):
    return {"signal_id": signal_id, "status": "rejected"}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /path/to/repo/backend
uv run pytest tests/test_signals_integration.py -v
```

Expected: `5 passed`

- [ ] **Step 6: Run full backend test suite to check for regressions**

```bash
cd /path/to/repo/backend
uv run pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/services/signals_service.py \
        backend/api/routes/signals.py \
        backend/tests/test_signals_integration.py
git commit -m "feat: wire Supabase trade persistence into approve_and_execute; add user_id ownership + idempotency"
```

---

## Chunk 6: Frontend — Settings tab profile persistence

### Task 7: Fetch and persist `boundary_mode` from `/v1/profile`

**Files:**
- Modify: `frontend/app/dashboard/page.tsx` (SettingsTab section only)
- Create: `frontend/__tests__/SettingsTab.test.tsx`

- [ ] **Step 1: Write the failing test**

`fetchWithAuth` must be importable from `frontend/lib/fetchWithAuth.ts` (Sprint 1 deliverable). The test mocks it.

```tsx
// frontend/__tests__/SettingsTab.test.tsx
/**
 * Tests for the SettingsTab profile persistence behaviour:
 * - On mount, GET /v1/profile is called and boundary_mode is applied to state
 * - When user clicks a different mode, PATCH /v1/profile is called
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock fetchWithAuth ────────────────────────────────────────────────────────
vi.mock("../../lib/fetchWithAuth", () => ({
  fetchWithAuth: vi.fn(),
}));
import { fetchWithAuth } from "../../lib/fetchWithAuth";

// ── Mock ThemeProvider (not under test) ──────────────────────────────────────
vi.mock("../components/ThemeProvider", () => ({
  useTheme: () => ({ dark: false, toggle: vi.fn() }),
}));

// ── Import the component ─────────────────────────────────────────────────────
// We test SettingsTab in isolation by exporting it.
// (After implementation, SettingsTab must be exported from dashboard/page.tsx)
import { SettingsTab } from "../app/dashboard/page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

describe("SettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches profile on mount and sets boundary mode from API", async () => {
    (fetchWithAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: async () => ({ boundary_mode: "autonomous", display_name: "Alice" }),
    });

    await act(async () => {
      render(<SettingsTab />);
    });

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`);
    });

    // The "Autonomous" mode button should appear selected
    const autonomousBtn = screen.getByRole("button", { name: /autonomous/i });
    expect(autonomousBtn).toHaveAttribute("data-selected", "true");
  });

  it("PATCHes profile when user selects a different mode", async () => {
    // First call: GET profile
    (fetchWithAuth as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        json: async () => ({ boundary_mode: "advisory" }),
      })
      // Second call: PATCH
      .mockResolvedValueOnce({ json: async () => ({}) });

    await act(async () => {
      render(<SettingsTab />);
    });

    // Wait for initial fetch
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));

    // Click "Conditional" mode
    const conditionalBtn = screen.getByRole("button", { name: /conditional/i });
    await act(async () => {
      fireEvent.click(conditionalBtn);
    });

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: "conditional" }),
      });
    });
  });

  it("defaults to conditional mode if API call fails", async () => {
    (fetchWithAuth as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error")
    );

    await act(async () => {
      render(<SettingsTab />);
    });

    // Should still render without crashing; default mode shown
    const conditionalBtn = screen.getByRole("button", { name: /conditional/i });
    expect(conditionalBtn).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/repo/frontend
npx vitest run __tests__/SettingsTab.test.tsx
```

Expected: `FAILED` — `SettingsTab` is not a named export; no `fetchWithAuth` calls in implementation.

- [ ] **Step 3: Update `SettingsTab` in `frontend/app/dashboard/page.tsx`**

Replace the existing `SettingsTab` function with the version below. The component now:
1. Calls `GET /v1/profile` on mount via `fetchWithAuth`.
2. Sets `mode` from `profile.boundary_mode`.
3. On mode button click, calls `PATCH /v1/profile` and updates local state.
4. Handles fetch errors gracefully (logs, keeps default).

Also add a named export for `SettingsTab` so tests can import it directly.

Find the existing `SettingsTab` function (lines 388–493 in `frontend/app/dashboard/page.tsx`) and replace it:

```tsx
// Replace the existing SettingsTab function with this version.
// Also add `export` keyword so tests can import it.

export function SettingsTab() {
  const { dark, toggle } = useTheme();
  const [mode, setMode] = useState<"advisory" | "conditional" | "autonomous">("conditional");

  const modes = [
    { id: "advisory",    label: "Advisory",    color: "var(--dim)",  desc: "AI signals only. You execute." },
    { id: "conditional", label: "Conditional", color: "var(--hold)", desc: "Approve each trade." },
    { id: "autonomous",  label: "Autonomous",  color: "var(--bull)", desc: "AI executes. Override window." },
  ] as const;

  // ── Load persisted mode from profile on mount ──────────────────────────────
  useEffect(() => {
    fetchWithAuth(`${API_URL}/v1/profile`)
      .then((r) => r.json())
      .then((profile) => {
        if (profile?.boundary_mode) {
          setMode(profile.boundary_mode as typeof mode);
        }
      })
      .catch((err) => {
        console.error("Failed to load profile boundary_mode:", err);
      });
  }, []);

  // ── Persist mode change to profile ────────────────────────────────────────
  async function handleModeChange(newMode: typeof mode) {
    setMode(newMode);
    try {
      await fetchWithAuth(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: newMode }),
      });
    } catch (err) {
      console.error("Failed to persist boundary_mode:", err);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Appearance */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>APPEARANCE</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 18px", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div style={{ color: "var(--ink)", fontSize: 14, fontFamily: "var(--font-nunito)", fontWeight: 600 }}>
                {dark ? "Dark mode" : "Light mode"}
              </div>
              <div style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-nunito)", marginTop: 2 }}>
                {dark ? "IBKR terminal aesthetic" : "Clean light interface"}
              </div>
            </div>
            <button
              onClick={toggle}
              style={{
                width: 48,
                height: 26,
                borderRadius: 13,
                background: dark ? "var(--brand)" : "var(--line2)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s ease",
                flexShrink: 0,
              }}
              aria-label="Toggle theme"
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: dark ? 25 : 3,
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* Execution mode */}
      <div>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>EXECUTION MODE</div>
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => handleModeChange(m.id)}
            data-selected={mode === m.id ? "true" : "false"}
            className="text-left w-full mb-2"
            style={{
              background: mode === m.id ? "var(--elevated)" : "var(--surface)",
              border: `1px solid ${mode === m.id ? m.color : "var(--line)"}`,
              borderRadius: 10,
              padding: "14px 18px",
              cursor: "pointer",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold" style={{ fontSize: 15, color: mode === m.id ? m.color : "var(--dim)" }}>
                {m.label}
              </span>
              {mode === m.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />}
            </div>
            <p style={{ color: "var(--ghost)", fontSize: 13, fontFamily: "var(--font-nunito)" }}>{m.desc}</p>
          </button>
        ))}
      </div>

      {/* About */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "16px 18px", boxShadow: "var(--card-shadow)" }}>
        <div style={{ color: "var(--ghost)", fontSize: 11, fontFamily: "var(--font-jb)", marginBottom: 10 }}>ABOUT</div>
        <div className="flex flex-col gap-2">
          {[
            ["Engine",  "Gemini 2.5 Flash"],
            ["Data",    "yfinance · 90d OHLCV"],
            ["Broker",  "Alpaca Paper Trading"],
            ["Market",  "US Equities"],
            ["Style",   "Swing Trading"],
            ["Version", "0.1.0 · Phase 2"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span style={{ color: "var(--ghost)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{k}</span>
              <span style={{ color: "var(--dim)", fontSize: 12, fontFamily: "var(--font-jb)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Also add the `fetchWithAuth` import near the top of `frontend/app/dashboard/page.tsx` (after the existing imports):

```tsx
import { fetchWithAuth } from "../lib/fetchWithAuth";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /path/to/repo/frontend
npx vitest run __tests__/SettingsTab.test.tsx
```

Expected: `3 passed`

- [ ] **Step 5: Run the full frontend build to catch TypeScript errors**

```bash
cd /path/to/repo/frontend
npm run build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/page.tsx \
        frontend/__tests__/SettingsTab.test.tsx
git commit -m "feat: persist boundary_mode via GET/PATCH /v1/profile in SettingsTab"
```

---

## Chunk 7: Final wiring — portfolio route auth + end-to-end smoke test

### Task 8: Add `get_current_user` to portfolio route

**Files:**
- Modify: `backend/api/routes/portfolio.py`

This is a small hardening change — no new logic, just adds the auth dependency so the endpoint cannot be called unauthenticated.

- [ ] **Step 1: Update `backend/api/routes/portfolio.py`**

```python
# backend/api/routes/portfolio.py
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user

router = APIRouter(prefix="/v1", tags=["portfolio"])
logger = logging.getLogger(__name__)


class Position(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    current_price: float
    pnl: float


class PortfolioSummary(BaseModel):
    total_value: float
    cash: float
    pnl_today: float
    pnl_total: float
    positions: list[Position]


_BASE_CAPITAL = 100_000.0  # Alpaca paper starting capital


@router.get("/portfolio", response_model=PortfolioSummary)
def get_portfolio(user_id: str = Depends(get_current_user)):
    try:
        from broker.factory import get_broker
        broker = get_broker()
        account = broker.get_account()
        raw_positions = broker.get_positions()

        positions = [
            Position(
                ticker=p["ticker"],
                shares=p["qty"],
                avg_cost=p["avg_cost"],
                current_price=p["current_price"],
                pnl=p["unrealized_pl"],
            )
            for p in raw_positions
        ]

        total_unrealized_pl = sum(p.pnl for p in positions)
        pnl_total = account["equity"] - _BASE_CAPITAL

        return PortfolioSummary(
            total_value=account["portfolio_value"],
            cash=account["cash"],
            pnl_today=total_unrealized_pl,
            pnl_total=pnl_total,
            positions=positions,
        )
    except Exception as exc:
        logger.exception("Failed to fetch portfolio from Alpaca")
        raise HTTPException(status_code=500, detail=str(exc))
```

- [ ] **Step 2: Run full backend test suite**

```bash
cd /path/to/repo/backend
uv run pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 3: Verify no unauthenticated route access**

```bash
cd /path/to/repo/backend
uv run pytest tests/ -k "auth or profile or signals" -v
```

Expected: all relevant tests pass, unauthenticated requests return 401.

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes/portfolio.py
git commit -m "feat: add get_current_user auth dependency to portfolio route"
```

---

## Summary of files changed

| File | Status |
|------|--------|
| `backend/db/__init__.py` | Created |
| `backend/db/supabase.py` | Created |
| `backend/services/portfolio_service.py` | Created |
| `backend/services/trade_service.py` | Created |
| `backend/services/profile_service.py` | Created |
| `backend/api/routes/profile.py` | Created |
| `backend/tests/__init__.py` | Created |
| `backend/tests/test_supabase_client.py` | Created |
| `backend/tests/test_portfolio_service.py` | Created |
| `backend/tests/test_trade_service.py` | Created |
| `backend/tests/test_profile_service.py` | Created |
| `backend/tests/test_profile_route.py` | Created |
| `backend/tests/test_signals_integration.py` | Created |
| `frontend/__tests__/SettingsTab.test.tsx` | Created |
| `backend/services/signals_service.py` | Modified |
| `backend/api/routes/signals.py` | Modified |
| `backend/api/routes/portfolio.py` | Modified |
| `backend/main.py` | Modified |
| `frontend/app/dashboard/page.tsx` | Modified |
