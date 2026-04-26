create table if not exists public.tournament_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  config jsonb not null,
  current_round int not null default 0,
  total_rounds int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_jobs enable row level security;
create policy "users see own tournaments"
  on public.tournament_jobs for select
  using (user_id = auth.uid()::text);
create policy "service role full access tournaments"
  on public.tournament_jobs for all
  using (true)
  with check (true);
