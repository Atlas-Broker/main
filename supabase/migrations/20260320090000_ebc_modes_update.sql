-- Migration: add autonomous_guardrail to boundary_mode enum
-- Also updates philosophy_mode references if present
-- Apply via Supabase dashboard

-- profiles.boundary_mode: add autonomous_guardrail
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_boundary_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_boundary_mode_check
  CHECK (boundary_mode IN ('advisory', 'conditional', 'autonomous', 'autonomous_guardrail'));

-- trades.boundary_mode: add autonomous_guardrail
ALTER TABLE public.trades
  DROP CONSTRAINT IF EXISTS trades_boundary_mode_check;
ALTER TABLE public.trades
  ADD CONSTRAINT trades_boundary_mode_check
  CHECK (boundary_mode IN ('advisory', 'conditional', 'autonomous', 'autonomous_guardrail'));

-- backtest_jobs.ebc_mode: add autonomous_guardrail
ALTER TABLE public.backtest_jobs
  DROP CONSTRAINT IF EXISTS backtest_jobs_ebc_mode_check;
ALTER TABLE public.backtest_jobs
  ADD CONSTRAINT backtest_jobs_ebc_mode_check
  CHECK (ebc_mode IN ('advisory', 'conditional', 'autonomous', 'autonomous_guardrail'));
