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
