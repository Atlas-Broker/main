-- Add investment_philosophy column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS investment_philosophy TEXT NOT NULL DEFAULT 'balanced'
  CHECK (investment_philosophy IN ('balanced', 'buffett', 'soros', 'lynch'));
