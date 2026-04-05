-- Migration: add philosophy_mode and confidence_threshold to backtest_jobs

ALTER TABLE public.backtest_jobs
  ADD COLUMN IF NOT EXISTS philosophy_mode      text    DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS confidence_threshold float   DEFAULT NULL;
