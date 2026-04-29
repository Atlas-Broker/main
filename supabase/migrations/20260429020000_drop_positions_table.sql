-- public.positions is unused. All position data comes from Alpaca (/v2/positions).
-- The backtest simulator uses an in-memory Map<string, Position> — no DB involvement.
-- Zero .from('positions') calls exist in application code as of 2026-04-29.

DROP TABLE IF EXISTS public.positions CASCADE;
