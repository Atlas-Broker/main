-- Experiments table — groups related backtest jobs into a named experiment
CREATE TABLE IF NOT EXISTS backtest_experiments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,
  name            text        NOT NULL,
  experiment_type text        NOT NULL,   -- 'philosophy' | 'threshold' | 'mode' | 'single'
  tickers         text[]      NOT NULL,
  start_date      date        NOT NULL,
  end_date        date        NOT NULL,
  ebc_mode        text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Link each job to its parent experiment (nullable for legacy jobs)
ALTER TABLE backtest_jobs
  ADD COLUMN IF NOT EXISTS experiment_id uuid
  REFERENCES backtest_experiments (id) ON DELETE SET NULL;

-- Index for fast lookup of jobs belonging to an experiment
CREATE INDEX IF NOT EXISTS idx_backtest_jobs_experiment_id
  ON backtest_jobs (experiment_id);
