# Database Schema Migration — Clerk-Compatible Design Spec

> Foundation for all other sprints. Must be applied before Sprint 1 (Auth) begins.
> Status: Derived from spec review findings 2026-03-17.

---

## Problem

The existing schema uses `uuid references auth.users(id)` as the primary key for `profiles`, and cascades UUIDs through all foreign keys. Clerk user IDs are strings (`user_2abc...`), not UUIDs. Supabase's `auth.uid()` RLS function returns the Supabase Auth UUID — which will never exist when using Clerk.

The tables are currently empty (no production data). A clean drop-and-recreate migration is safe.

---

## Architectural Decisions

1. **Schema uses `text` primary keys** — Clerk user IDs stored directly as `profiles.id TEXT PRIMARY KEY`
2. **Backend-only Supabase access** — FastAPI uses the service key with manual `WHERE user_id = ?` filtering on every query. Frontend never calls Supabase directly.
3. **RLS remains enabled** as defence-in-depth but the primary enforcement is application-level filtering.
4. **One default portfolio per user** — Created by the `user.created` webhook. Every trade and position references this portfolio.
5. **`order_id` stored in `trades`** — Alpaca order ID needed for override cancellation.
6. **`override_log` extended** — Adds `order_id`, `ticker`, `broker_cancel_success`, `overridden_at` for full audit trail.

---

## New Schema

```sql
-- profiles: Clerk user ID as primary key
create table public.profiles (
  id text primary key,                          -- Clerk user ID: "user_2abc..."
  email text not null,
  display_name text,
  boundary_mode text not null default 'advisory'
    check (boundary_mode in ('advisory', 'conditional', 'autonomous')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- portfolios: one per user, created on signup
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.profiles(id) on delete cascade not null,
  name text not null default 'Paper Portfolio',
  cash numeric(15, 2) not null default 100000.00,
  created_at timestamptz not null default now(),
  unique(user_id)                               -- enforces one portfolio per user
);

-- positions: unique per (portfolio_id, ticker)
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  user_id text references public.profiles(id) on delete cascade not null,
  ticker text not null,
  shares numeric(15, 6) not null,
  avg_cost numeric(15, 4) not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(portfolio_id, ticker)
);

-- trades: full execution record including Alpaca order_id
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  user_id text references public.profiles(id) on delete cascade not null,
  ticker text not null,
  action text not null check (action in ('BUY', 'SELL')),
  shares numeric(15, 6) not null,
  price numeric(15, 4) not null,
  total_value numeric(15, 2) generated always as (shares * price) stored,
  status text not null default 'pending'
    check (status in ('pending', 'filled', 'rejected', 'cancelled', 'overridden')),
  boundary_mode text not null check (boundary_mode in ('advisory', 'conditional', 'autonomous')),
  signal_id text,                               -- MongoDB reasoning_trace _id
  order_id text,                                -- Alpaca order UUID
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

-- override_log: full audit trail for autonomous mode cancellations
create table public.override_log (
  id uuid primary key default gen_random_uuid(),
  user_id text references public.profiles(id) on delete cascade not null,
  trade_id uuid references public.trades(id) on delete cascade not null,
  order_id text,                                -- Alpaca order UUID
  ticker text,
  reason text,
  broker_cancel_success boolean not null default false,
  overridden_at timestamptz not null default now()
  -- no created_at: overridden_at is the canonical timestamp for this table
);
```

---

## RLS Policies

```sql
-- profiles
alter table public.profiles enable row level security;
create policy "Backend service key bypasses RLS"
  on public.profiles for all using (true);

-- portfolios
alter table public.portfolios enable row level security;
create policy "Backend service key bypasses RLS"
  on public.portfolios for all using (true);

-- positions
alter table public.positions enable row level security;
create policy "Backend service key bypasses RLS"
  on public.positions for all using (true);

-- trades
alter table public.trades enable row level security;
create policy "Backend service key bypasses RLS"
  on public.trades for all using (true);

-- override_log
alter table public.override_log enable row level security;
create policy "Backend service key bypasses RLS"
  on public.override_log for all using (true);
```

Note: Service key bypasses RLS at the Postgres level regardless of policy. RLS policies are `using (true)` as documentation — all real access control is enforced in the application layer via explicit `user_id` filters on every query.

---

## Migration file

New file: `database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql`

Contents: DROP old tables (cascade), then CREATE new tables as above.

```sql
-- Drop in reverse FK order (safe — tables are empty)
drop table if exists public.override_log cascade;
drop table if exists public.trades cascade;
drop table if exists public.positions cascade;
drop table if exists public.portfolios cascade;
drop table if exists public.profiles cascade;

-- Then CREATE all tables as defined above
```

---

## Portfolio acquisition strategy

Every route that writes to `trades` or `positions` needs a `portfolio_id`. The strategy:

```python
# backend/services/portfolio_service.py
def get_or_create_portfolio(user_id: str) -> str:
    """Returns portfolio UUID for user. Creates default if none exists.

    The portfolios table has UNIQUE(user_id), so concurrent inserts will
    conflict. We handle this with upsert (ON CONFLICT DO NOTHING) and
    a follow-up select to retrieve the existing row.
    """
    # Attempt upsert — inserts only if no row exists for this user_id
    supabase.table("portfolios").upsert(
        {"user_id": user_id, "name": "Paper Portfolio"},
        on_conflict="user_id",
        ignore_duplicates=True,
    ).execute()

    # Always fetch after upsert — works for both new and pre-existing rows
    result = supabase.table("portfolios") \
        .select("id") \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    return result.data["id"]
```

This is called at the start of `record_trade()` and `sync_positions()`.

The `user.created` Clerk webhook also calls `get_or_create_portfolio()` to pre-create the portfolio alongside the profile row so the user arrives at the dashboard with a portfolio already set up.

---

## Apply migration

```bash
cd database/supabase
supabase link --project-ref qbbbuebbxueqclkrvoos
supabase db push
```
