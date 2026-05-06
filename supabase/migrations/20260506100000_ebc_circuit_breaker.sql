-- Migration: EBC circuit breaker state columns on profiles
-- Implements the 3-state trust machine: green → yellow → red → (manual reset) → green

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ebc_state TEXT NOT NULL DEFAULT 'green'
    CHECK (ebc_state IN ('green', 'yellow', 'red')),
  ADD COLUMN IF NOT EXISTS ebc_consecutive_losses INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ebc_recovery_wins INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ebc_state_changed_at TIMESTAMPTZ;
