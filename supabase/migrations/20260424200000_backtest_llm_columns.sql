-- Add LLM provider columns to backtest_jobs so each job records which model it ran.
-- All three columns are safe to add with IF NOT EXISTS for idempotency.

ALTER TABLE public.backtest_jobs
  ADD COLUMN IF NOT EXISTS llm_provider text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS llm_model    text NOT NULL DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS llm_base_url text;

COMMENT ON COLUMN public.backtest_jobs.llm_provider IS 'LLM provider: gemini | groq | ollama | openai-compatible';
COMMENT ON COLUMN public.backtest_jobs.llm_model    IS 'Model identifier string (e.g. gemini-2.5-flash, llama-3.3-70b-versatile)';
COMMENT ON COLUMN public.backtest_jobs.llm_base_url IS 'Custom base URL for openai-compatible or Ollama providers (nullable)';
