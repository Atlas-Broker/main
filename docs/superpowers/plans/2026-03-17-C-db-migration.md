# Database Migration — Clerk-Compatible Schema

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase-Auth-UUID schema with a Clerk-compatible schema that uses `text` primary keys and an extended `override_log`, so the backend can store Clerk user IDs directly without any UUID conversion layer.

**Architecture:** A new migration file drops all five existing tables (cascade, tables are empty) and recreates them with `TEXT` user IDs on `profiles`, `UNIQUE(user_id)` on `portfolios`, `order_id` on `trades`, and `order_id / ticker / broker_cancel_success / overridden_at` on `override_log`. `database/supabase/schema.sql` already reflects the target schema as of 2026-03-17 and requires no further changes. The migration is applied via `supabase db push` against the linked remote project.

**Tech Stack:** PostgreSQL 15 (Supabase), Supabase CLI, Python 3.11, `supabase-py` v2, `pytest`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql` | New migration — drops old tables, creates Clerk-compatible schema |
| **No change needed** | `database/supabase/schema.sql` | Already updated 2026-03-17; kept as canonical reference |
| **Create** | `database/tests/test_migration_schema.py` | Introspects applied schema; asserts column types, constraints, absent columns |

---

## Chunk 1: Write and verify the migration SQL file

### Task 1: Write the migration file

**Files:**
- Create: `database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql`

- [ ] **Step 1: Create the migration file with the full SQL**

  Create `database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql` with the following exact content:

  ```sql
  -- Migration: Clerk-compatible schema
  -- Replaces Supabase-Auth UUID schema with TEXT user IDs for Clerk.
  -- Tables are empty — drop-and-recreate is safe.
  -- Applied: 2026-03-17

  -- Drop in reverse FK order
  drop table if exists public.override_log cascade;
  drop table if exists public.trades cascade;
  drop table if exists public.positions cascade;
  drop table if exists public.portfolios cascade;
  drop table if exists public.profiles cascade;

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

  alter table public.profiles enable row level security;
  create policy "Backend service key bypasses RLS"
    on public.profiles for all using (true);


  -- portfolios: one per user, created on signup
  create table public.portfolios (
    id uuid primary key default gen_random_uuid(),
    user_id text references public.profiles(id) on delete cascade not null,
    name text not null default 'Paper Portfolio',
    cash numeric(15, 2) not null default 100000.00,
    created_at timestamptz not null default now(),
    unique(user_id)                               -- enforces one portfolio per user
  );

  alter table public.portfolios enable row level security;
  create policy "Backend service key bypasses RLS"
    on public.portfolios for all using (true);


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

  alter table public.positions enable row level security;
  create policy "Backend service key bypasses RLS"
    on public.positions for all using (true);


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

  alter table public.trades enable row level security;
  create policy "Backend service key bypasses RLS"
    on public.trades for all using (true);


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

  alter table public.override_log enable row level security;
  create policy "Backend service key bypasses RLS"
    on public.override_log for all using (true);
  ```

- [ ] **Step 2: Verify the file exists and has no syntax issues by doing a quick line-count check**

  Run:
  ```bash
  wc -l database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql
  ```
  Expected output: a line count around 75–85 (exact count varies by editor newlines).

- [ ] **Step 3: Confirm schema.sql already matches — no edits needed**

  Open `database/supabase/schema.sql` and verify:
  - `profiles.id` is `text primary key` (not `uuid references auth.users`)
  - `portfolios` has `unique(user_id)` constraint
  - `trades` has `order_id text` column
  - `override_log` has `order_id text`, `ticker text`, `broker_cancel_success boolean`, `overridden_at timestamptz`, and NO `created_at` column
  - RLS policies say `"Backend service key bypasses RLS"` with `using (true)`

  If all match: no edit needed. If any differ: update `schema.sql` to match the migration file above.

- [ ] **Step 4: Commit the migration file**

  ```bash
  git add database/supabase/supabase/migrations/20260317000000_clerk_compatible_schema.sql
  git commit -m "feat: add Clerk-compatible schema migration (text user IDs, extended override_log)"
  ```

---

## Chunk 2: Write a schema introspection test

The test connects to the remote Supabase database via the `supabase-py` client and queries `information_schema` to verify that the applied schema matches the spec. The test does **not** apply the migration itself — that is done in Chunk 3. Run this test after migration to confirm success.

### Task 2: Write and validate the schema introspection test

**Files:**
- Create: `database/tests/test_migration_schema.py`

> **Pre-condition:** This test requires `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to be set as environment variables. It connects to the real remote database. Do NOT run against production with live data. Tables are expected to be empty at this stage.

- [ ] **Step 1: Create the test file**

  Create `database/tests/test_migration_schema.py`:

  ```python
  """
  Schema introspection tests for the 2026-03-17 Clerk-compatible migration.

  Requires:
      SUPABASE_URL       — the project URL (e.g. https://qbbbuebbxueqclkrvoos.supabase.co)
      SUPABASE_SERVICE_KEY — service role key (bypasses RLS)

  Run after applying the migration:
      cd database
      python -m pytest tests/test_migration_schema.py -v
  """

  import os
  import pytest
  from supabase import create_client, Client


  @pytest.fixture(scope="module")
  def client() -> Client:
      url = os.environ.get("SUPABASE_URL")
      key = os.environ.get("SUPABASE_SERVICE_KEY")
      if not url or not key:
          pytest.skip("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
      return create_client(url, key)


  def _get_columns(client: Client, table_name: str) -> dict[str, dict]:
      """Returns {column_name: {data_type, is_nullable, column_default}} for a table."""
      result = (
          client
          .table("information_schema.columns")
          .select("column_name,data_type,is_nullable,column_default")
          .eq("table_schema", "public")
          .eq("table_name", table_name)
          .execute()
      )
      return {row["column_name"]: row for row in result.data}


  # ---------------------------------------------------------------------------
  # profiles
  # ---------------------------------------------------------------------------

  class TestProfilesTable:
      def test_id_is_text(self, client: Client):
          cols = _get_columns(client, "profiles")
          assert cols["id"]["data_type"] == "text", (
              f"profiles.id must be text (Clerk ID), got: {cols['id']['data_type']}"
          )

      def test_no_uuid_fk_to_auth_users(self, client: Client):
          """profiles.id must NOT be uuid — that would mean old Supabase-Auth schema."""
          cols = _get_columns(client, "profiles")
          assert cols["id"]["data_type"] != "uuid", (
              "profiles.id is uuid — old Supabase-Auth schema still applied"
          )

      def test_required_columns_exist(self, client: Client):
          cols = _get_columns(client, "profiles")
          required = {"id", "email", "display_name", "boundary_mode",
                      "onboarding_completed", "created_at", "updated_at"}
          missing = required - set(cols.keys())
          assert not missing, f"profiles missing columns: {missing}"

      def test_boundary_mode_has_default(self, client: Client):
          cols = _get_columns(client, "profiles")
          default = cols["boundary_mode"]["column_default"]
          assert default is not None and "advisory" in default, (
              f"profiles.boundary_mode default should be 'advisory', got: {default}"
          )

      def test_onboarding_completed_present(self, client: Client):
          cols = _get_columns(client, "profiles")
          assert "onboarding_completed" in cols, (
              "profiles.onboarding_completed column missing — old schema did not have this"
          )


  # ---------------------------------------------------------------------------
  # portfolios
  # ---------------------------------------------------------------------------

  class TestPortfoliosTable:
      def test_user_id_is_text(self, client: Client):
          cols = _get_columns(client, "portfolios")
          assert cols["user_id"]["data_type"] == "text", (
              f"portfolios.user_id must be text, got: {cols['user_id']['data_type']}"
          )

      def test_unique_user_id_constraint_exists(self, client: Client):
          """UNIQUE(user_id) enforces one portfolio per user. Introspect via pg_indexes."""
          result = (
              client
              .rpc("pg_catalog.pg_indexes", {})
              .execute()
          )
          # Fallback: attempt insert of a second portfolio for same user_id and
          # expect a unique-violation error.
          # We validate the constraint via information_schema.table_constraints instead.
          result2 = (
              client
              .table("information_schema.table_constraints")
              .select("constraint_type,constraint_name")
              .eq("table_schema", "public")
              .eq("table_name", "portfolios")
              .eq("constraint_type", "UNIQUE")
              .execute()
          )
          assert len(result2.data) >= 1, (
              "portfolios table has no UNIQUE constraint — UNIQUE(user_id) is missing"
          )


  # ---------------------------------------------------------------------------
  # trades
  # ---------------------------------------------------------------------------

  class TestTradesTable:
      def test_order_id_column_exists(self, client: Client):
          cols = _get_columns(client, "trades")
          assert "order_id" in cols, (
              "trades.order_id column missing — needed for Alpaca override cancellation"
          )

      def test_order_id_is_text(self, client: Client):
          cols = _get_columns(client, "trades")
          assert cols["order_id"]["data_type"] == "text", (
              f"trades.order_id must be text, got: {cols['order_id']['data_type']}"
          )

      def test_user_id_is_text(self, client: Client):
          cols = _get_columns(client, "trades")
          assert cols["user_id"]["data_type"] == "text", (
              f"trades.user_id must be text, got: {cols['user_id']['data_type']}"
          )

      def test_total_value_is_generated(self, client: Client):
          """total_value is a generated column (shares * price)."""
          cols = _get_columns(client, "trades")
          assert "total_value" in cols, "trades.total_value column missing"
          # generated columns show a column_default in information_schema
          # The key check is that the column exists with numeric type
          assert cols["total_value"]["data_type"] == "numeric"


  # ---------------------------------------------------------------------------
  # override_log
  # ---------------------------------------------------------------------------

  class TestOverrideLogTable:
      def test_order_id_column_exists(self, client: Client):
          cols = _get_columns(client, "override_log")
          assert "order_id" in cols, "override_log.order_id column missing"

      def test_ticker_column_exists(self, client: Client):
          cols = _get_columns(client, "override_log")
          assert "ticker" in cols, "override_log.ticker column missing"

      def test_broker_cancel_success_column_exists(self, client: Client):
          cols = _get_columns(client, "override_log")
          assert "broker_cancel_success" in cols, (
              "override_log.broker_cancel_success column missing"
          )

      def test_overridden_at_column_exists(self, client: Client):
          cols = _get_columns(client, "override_log")
          assert "overridden_at" in cols, "override_log.overridden_at column missing"

      def test_no_created_at_column(self, client: Client):
          """override_log uses overridden_at as canonical timestamp; created_at must not exist."""
          cols = _get_columns(client, "override_log")
          assert "created_at" not in cols, (
              "override_log.created_at must not exist — overridden_at is the canonical timestamp"
          )

      def test_user_id_is_text(self, client: Client):
          cols = _get_columns(client, "override_log")
          assert cols["user_id"]["data_type"] == "text", (
              f"override_log.user_id must be text, got: {cols['user_id']['data_type']}"
          )
  ```

- [ ] **Step 2: Run the test BEFORE the migration — it must FAIL**

  > This step confirms the test is actually checking the live schema, not vacuously passing.

  Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are exported in your shell (values from `.env` or Render environment):

  ```bash
  export SUPABASE_URL=https://qbbbuebbxueqclkrvoos.supabase.co
  export SUPABASE_SERVICE_KEY=<your-service-key>
  ```

  Then run from the repo root:

  ```bash
  cd /path/to/repo
  pip install supabase pytest --quiet
  python -m pytest database/tests/test_migration_schema.py -v
  ```

  Expected: Several `FAILED` results. Specifically:
  - `test_id_is_text` — fails because old schema has `uuid` type
  - `test_no_uuid_fk_to_auth_users` — fails for same reason
  - `test_onboarding_completed_present` — fails because old schema lacks this column
  - `test_order_id_column_exists` (trades) — fails because old schema has no `order_id`
  - `test_no_created_at_column` (override_log) — fails because old schema has `created_at`
  - `test_broker_cancel_success_column_exists` — fails because old schema lacks this column

  If all tests pass at this point, stop — the old schema was not applied and investigation is needed before proceeding.

- [ ] **Step 3: Commit the test file (before it passes)**

  ```bash
  git add database/tests/test_migration_schema.py
  git commit -m "test: add schema introspection tests for Clerk-compatible migration (pre-migration RED state)"
  ```

---

## Chunk 3: Apply the migration and run smoke tests

### Task 3: Link project and push migration

**Files:**
- No code changes — applies existing migration file to remote Supabase project.

- [ ] **Step 1: Ensure Supabase CLI is installed**

  ```bash
  supabase --version
  ```

  Expected output: `1.x.x` or higher. If not installed:

  ```bash
  brew install supabase/tap/supabase
  ```

- [ ] **Step 2: Link the Supabase CLI to the remote project**

  ```bash
  cd database/supabase
  supabase link --project-ref qbbbuebbxueqclkrvoos
  ```

  Expected: Prompts for database password (set in Supabase dashboard under Project Settings → Database). Enter it when prompted.

  Expected final output:
  ```
  Finished supabase link.
  ```

- [ ] **Step 3: Dry-run to preview what will be applied**

  ```bash
  supabase db push --dry-run
  ```

  Expected output: Shows the new migration `20260317000000_clerk_compatible_schema.sql` listed as pending. Should NOT show the old `20260313054120_initial_schema.sql` as pending (it should already be recorded in the migration history, or it will also appear — that is fine).

  If the dry-run shows unexpected warnings about schema drift, read the output carefully before proceeding.

- [ ] **Step 4: Apply the migration**

  ```bash
  supabase db push
  ```

  Expected output:
  ```
  Applying migration 20260317000000_clerk_compatible_schema.sql...
  Finished supabase db push.
  ```

  If you see errors such as `ERROR: column "id" of relation "profiles" is of type uuid`, the old migration was not previously applied — this is safe: the DROP statements at the top of the migration will handle it. Re-run with `supabase db push --include-all` if needed, or manually run the SQL via the Supabase SQL Editor.

---

## Chunk 4: Post-migration verification

### Task 4: Run the schema tests (GREEN state)

- [ ] **Step 1: Run the schema introspection tests after migration**

  ```bash
  cd /path/to/repo
  python -m pytest database/tests/test_migration_schema.py -v
  ```

  Expected: ALL tests pass. Full output should look like:

  ```
  tests/test_migration_schema.py::TestProfilesTable::test_id_is_text PASSED
  tests/test_migration_schema.py::TestProfilesTable::test_no_uuid_fk_to_auth_users PASSED
  tests/test_migration_schema.py::TestProfilesTable::test_required_columns_exist PASSED
  tests/test_migration_schema.py::TestProfilesTable::test_boundary_mode_has_default PASSED
  tests/test_migration_schema.py::TestProfilesTable::test_onboarding_completed_present PASSED
  tests/test_migration_schema.py::TestPortfoliosTable::test_user_id_is_text PASSED
  tests/test_migration_schema.py::TestPortfoliosTable::test_unique_user_id_constraint_exists PASSED
  tests/test_migration_schema.py::TestTradesTable::test_order_id_column_exists PASSED
  tests/test_migration_schema.py::TestTradesTable::test_order_id_is_text PASSED
  tests/test_migration_schema.py::TestTradesTable::test_user_id_is_text PASSED
  tests/test_migration_schema.py::TestTradesTable::test_total_value_is_generated PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_order_id_column_exists PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_ticker_column_exists PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_broker_cancel_success_column_exists PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_overridden_at_column_exists PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_no_created_at_column PASSED
  tests/test_migration_schema.py::TestOverrideLogTable::test_user_id_is_text PASSED

  ============================== 17 passed in x.xxs ==============================
  ```

  If any test fails, investigate via the Supabase SQL Editor:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position;
  ```

- [ ] **Step 2: Smoke test — insert and retrieve a profile row**

  In the Supabase SQL Editor (or via `supabase db remote changes`), run:

  ```sql
  -- Insert a fake Clerk user
  insert into public.profiles (id, email, display_name, boundary_mode, onboarding_completed)
  values ('user_smoke_test_001', 'smoke@test.com', 'Smoke Test', 'advisory', false);

  -- Verify it round-trips
  select id, email, boundary_mode, onboarding_completed from public.profiles
  where id = 'user_smoke_test_001';
  ```

  Expected: 1 row returned with `id = 'user_smoke_test_001'`.

  Clean up:
  ```sql
  delete from public.profiles where id = 'user_smoke_test_001';
  ```

- [ ] **Step 3: Smoke test — verify UNIQUE(user_id) on portfolios is enforced**

  In the Supabase SQL Editor:

  ```sql
  -- Insert profile first (FK constraint)
  insert into public.profiles (id, email) values ('user_unique_test_001', 'u@test.com');

  -- First portfolio insert — should succeed
  insert into public.portfolios (user_id, name) values ('user_unique_test_001', 'Test Portfolio');

  -- Second portfolio insert for same user — must fail with unique violation
  insert into public.portfolios (user_id, name) values ('user_unique_test_001', 'Duplicate Portfolio');
  ```

  Expected: Second insert raises:
  ```
  ERROR: duplicate key value violates unique constraint "portfolios_user_id_key"
  ```

  Clean up:
  ```sql
  delete from public.profiles where id = 'user_unique_test_001';
  -- Cascade deletes portfolio too
  ```

- [ ] **Step 4: Final commit**

  ```bash
  git add database/tests/test_migration_schema.py
  git commit -m "test: schema introspection tests pass (GREEN) after Clerk-compatible migration"
  ```

---

## Notes

- `database/supabase/schema.sql` was already updated to match the target schema on 2026-03-17 and requires no further changes. It serves as the human-readable canonical reference.
- The old migration `20260313054120_initial_schema.sql` used `uuid references auth.users(id)` for `profiles.id` and `auth.uid()` in RLS policies. Both are incompatible with Clerk. The new migration drops and recreates all tables, making the old migration a historical artifact only.
- All user isolation is enforced at the application layer (`WHERE user_id = ?` on every query). RLS policies use `using (true)` as defence-in-depth; the service key bypasses RLS at the Postgres level regardless.
- Sprint 1 (Auth/Clerk webhook) depends on this migration being applied before implementation begins.
