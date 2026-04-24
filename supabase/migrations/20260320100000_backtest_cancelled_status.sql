-- Add "cancelled" to the allowed status values for backtest_jobs.
-- The existing constraint name may differ across environments; drop by name if it exists.

ALTER TABLE backtest_jobs
  DROP CONSTRAINT IF EXISTS backtest_jobs_status_check;

ALTER TABLE backtest_jobs
  ADD CONSTRAINT backtest_jobs_status_check
  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'));
