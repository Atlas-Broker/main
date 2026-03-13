-- Atlas — Supabase Schema
-- Fresh start: drop ALL tables (old + new) then recreate

drop table if exists public.watchlists cascade;
drop table if exists public.trader_settings cascade;
drop table if exists public.orders cascade;
drop table if exists public.equity_snapshots cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.agent_trades cascade;
drop table if exists public.agent_reasoning cascade;
drop table if exists public.agent_positions cascade;
drop table if exists public.agent_leaderboard cascade;
drop table if exists public.agent_daily_performance cascade;
drop table if exists public.agent_competitors cascade;
drop table if exists public.accounts cascade;
drop table if exists public.override_log cascade;
drop table if exists public.trades cascade;
drop table if exists public.positions cascade;
drop table if exists public.portfolios cascade;
drop table if exists public.profiles cascade;

-- Users (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  display_name text,
  boundary_mode text not null default 'advisory' check (boundary_mode in ('advisory', 'conditional', 'autonomous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can only access their own profile"
  on public.profiles for all using (auth.uid() = id);


-- Portfolios
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null default 'Paper Portfolio',
  cash numeric(15, 2) not null default 100000.00,
  created_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;
create policy "Users can only access their own portfolios"
  on public.portfolios for all using (auth.uid() = user_id);


-- Positions
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  shares numeric(15, 6) not null,
  avg_cost numeric(15, 4) not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(portfolio_id, ticker)
);

alter table public.positions enable row level security;
create policy "Users can only access their own positions"
  on public.positions for all using (auth.uid() = user_id);


-- Trades
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid references public.portfolios(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  ticker text not null,
  action text not null check (action in ('BUY', 'SELL')),
  shares numeric(15, 6) not null,
  price numeric(15, 4) not null,
  total_value numeric(15, 2) generated always as (shares * price) stored,
  status text not null default 'pending' check (status in ('pending', 'filled', 'rejected', 'cancelled', 'overridden')),
  boundary_mode text not null check (boundary_mode in ('advisory', 'conditional', 'autonomous')),
  signal_id text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.trades enable row level security;
create policy "Users can only access their own trades"
  on public.trades for all using (auth.uid() = user_id);


-- Override Log (Autonomous mode)
create table public.override_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  trade_id uuid references public.trades(id) on delete cascade not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.override_log enable row level security;
create policy "Users can only access their own override logs"
  on public.override_log for all using (auth.uid() = user_id);
