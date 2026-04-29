-- 1. backtest_experiments: enable RLS (was completely off)
ALTER TABLE public.backtest_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.backtest_experiments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Experiments are admin-gated at API level, but RLS still scopes reads to own rows
CREATE POLICY "Users can read own experiments"
  ON public.backtest_experiments
  FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'));

-- 2. tournament_jobs: fix over-permissive policy (was on {public}, not {service_role})
DROP POLICY IF EXISTS "service role full access tournaments" ON public.tournament_jobs;

CREATE POLICY "service role full access tournaments"
  ON public.tournament_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
