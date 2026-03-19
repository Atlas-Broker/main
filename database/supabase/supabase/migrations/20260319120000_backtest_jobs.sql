-- Migration: backtest_jobs table
-- Stores backtest job metadata. Full results (daily_runs, equity_curve, metrics)
-- live in MongoDB (backtest_results collection) referenced by mongo_id.

CREATE TABLE public.backtest_jobs (
  id                       uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  text        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                   text        NOT NULL DEFAULT 'queued'
                                        CHECK (status IN ('queued','running','completed','failed')),
  tickers                  text[]      NOT NULL,
  start_date               date        NOT NULL,
  end_date                 date        NOT NULL,
  ebc_mode                 text        NOT NULL
                                        CHECK (ebc_mode IN ('advisory','conditional','autonomous')),
  initial_capital          float       NOT NULL DEFAULT 10000,
  mongo_id                 text,
  total_return             float,
  sharpe_ratio             float,
  max_drawdown             float,
  win_rate                 float,
  total_trades             int,
  signal_to_execution_rate float,
  progress                 int         NOT NULL DEFAULT 0,
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);

ALTER TABLE public.backtest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own backtest jobs"
  ON public.backtest_jobs FOR ALL
  USING ((auth.jwt() ->> 'sub') = user_id)
  WITH CHECK ((auth.jwt() ->> 'sub') = user_id);
