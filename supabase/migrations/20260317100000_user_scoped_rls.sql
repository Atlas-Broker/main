-- Migration: User-scoped RLS policies
-- Replaces the permissive "using (true)" policies with JWT-scoped policies.
-- The backend service role key bypasses RLS natively — no policy needed for it.
-- Frontend uses Clerk's "atlas-supabase" JWT template; auth.jwt() ->> 'sub'
-- returns the Clerk user ID which matches the id / user_id columns.

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "Backend service key bypasses RLS" on public.profiles;

create policy "Users can read own profile"
  on public.profiles for select
  using ((auth.jwt() ->> 'sub') = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check ((auth.jwt() ->> 'sub') = id);

create policy "Users can update own profile"
  on public.profiles for update
  using ((auth.jwt() ->> 'sub') = id);


-- ── portfolios ────────────────────────────────────────────────────────────────
drop policy if exists "Backend service key bypasses RLS" on public.portfolios;

create policy "Users can read own portfolio"
  on public.portfolios for select
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "Users can insert own portfolio"
  on public.portfolios for insert
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "Users can update own portfolio"
  on public.portfolios for update
  using ((auth.jwt() ->> 'sub') = user_id);


-- ── positions ─────────────────────────────────────────────────────────────────
drop policy if exists "Backend service key bypasses RLS" on public.positions;

create policy "Users can read own positions"
  on public.positions for select
  using ((auth.jwt() ->> 'sub') = user_id);


-- ── trades ────────────────────────────────────────────────────────────────────
drop policy if exists "Backend service key bypasses RLS" on public.trades;

create policy "Users can read own trades"
  on public.trades for select
  using ((auth.jwt() ->> 'sub') = user_id);


-- ── override_log ──────────────────────────────────────────────────────────────
drop policy if exists "Backend service key bypasses RLS" on public.override_log;

create policy "Users can read own override log"
  on public.override_log for select
  using ((auth.jwt() ->> 'sub') = user_id);
