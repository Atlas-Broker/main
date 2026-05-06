/**
 * EBC Circuit Breaker — 3-state trust machine.
 *
 * Implements the academic contribution from sprint 030:
 *   green  → normal execution ($1 000 notional, confidence ≥ 0.65)
 *   yellow → reduced execution ($500 notional, confidence ≥ 0.75)
 *   red    → advisory only (no execution, manual user reset required)
 *
 * Two layers:
 *   - Pure functions (computeNextState, gateFromState) — no I/O; used by backtest.
 *   - Async Supabase-backed functions (getEffectiveGate, evaluateCircuitBreaker,
 *     resetCircuitBreaker) — used by live trading.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EbcState = "green" | "yellow" | "red";

export type EbcGate = {
  state: EbcState;
  canExecute: boolean;
  confidenceGate: number;
  notionalMultiplier: number;
  reason?: string;
};

export type EbcRecord = {
  state: EbcState;
  consecutiveLosses: number;
  recoveryWins: number;
  stateChangedAt: Date;
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

const YELLOW_LOSS_TRIGGER = 3;   // green → yellow after this many consecutive losses
const RED_LOSS_TRIGGER = 5;      // yellow → red after this many consecutive losses (total)
const YELLOW_RECOVERY_WINS = 2;  // wins required to exit yellow (plus 24h cool-off)
const YELLOW_COOLOFF_HOURS = 24; // minimum time in yellow before recovery is possible

// ─── Pure state-machine ───────────────────────────────────────────────────────

/**
 * Derive EbcGate parameters from a state label — no I/O.
 */
export function gateFromState(state: EbcState): EbcGate {
  switch (state) {
    case "green":
      return { state, canExecute: true, confidenceGate: 0.65, notionalMultiplier: 1.0 };
    case "yellow":
      return {
        state,
        canExecute: true,
        confidenceGate: 0.75,
        notionalMultiplier: 0.5,
        reason: "Reduced position sizing after consecutive losses",
      };
    case "red":
      return {
        state,
        canExecute: false,
        confidenceGate: 1.0,
        notionalMultiplier: 0,
        reason: "Execution paused — manual reset required",
      };
  }
}

/**
 * Pure transition function — given current record + outcome, return next record.
 * Used by the backtest simulation pass (no Supabase calls).
 */
export function computeNextState(record: EbcRecord, outcome: "win" | "loss"): EbcRecord {
  const { state, consecutiveLosses, recoveryWins, stateChangedAt } = record;
  const now = stateChangedAt; // preserve timestamp unless state changes

  if (outcome === "loss") {
    const newLosses = consecutiveLosses + 1;
    let newState = state;

    if (state === "green" && newLosses >= YELLOW_LOSS_TRIGGER) newState = "yellow";
    else if (state === "yellow" && newLosses >= RED_LOSS_TRIGGER) newState = "red";

    return {
      state: newState,
      consecutiveLosses: newLosses,
      recoveryWins: 0,
      stateChangedAt: newState !== state ? new Date() : now,
    };
  }

  // win
  if (state === "red") {
    // red requires manual reset — wins don't count
    return record;
  }

  const newLosses = 0;

  if (state === "yellow") {
    const newWins = recoveryWins + 1;
    const hoursSince = (Date.now() - stateChangedAt.getTime()) / 3_600_000;
    if (newWins >= YELLOW_RECOVERY_WINS && hoursSince >= YELLOW_COOLOFF_HOURS) {
      return { state: "green", consecutiveLosses: 0, recoveryWins: 0, stateChangedAt: new Date() };
    }
    return { state, consecutiveLosses: newLosses, recoveryWins: newWins, stateChangedAt: now };
  }

  // green — reset streaks on win
  return { state, consecutiveLosses: 0, recoveryWins: 0, stateChangedAt: now };
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Live-trading async functions ─────────────────────────────────────────────

/**
 * Read the user's current EBC state from Supabase and return gate parameters.
 * Fails open — returns green gate if Supabase is unreachable.
 */
export async function getEffectiveGate(userId: string): Promise<EbcGate> {
  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from("profiles")
      .select("ebc_state")
      .eq("id", userId)
      .maybeSingle();
    return gateFromState((data?.ebc_state as EbcState) ?? "green");
  } catch {
    return gateFromState("green");
  }
}

/**
 * Record a trade outcome and transition state if thresholds are crossed.
 * Returns the new state after the transition.
 */
export async function evaluateCircuitBreaker(
  userId: string,
  outcome: "win" | "loss",
): Promise<EbcState> {
  try {
    const sb = getServiceClient();
    const { data } = await sb
      .from("profiles")
      .select("ebc_state, ebc_consecutive_losses, ebc_recovery_wins, ebc_state_changed_at")
      .eq("id", userId)
      .maybeSingle();

    if (!data) return "green";

    const record: EbcRecord = {
      state: (data.ebc_state as EbcState) ?? "green",
      consecutiveLosses: data.ebc_consecutive_losses ?? 0,
      recoveryWins: data.ebc_recovery_wins ?? 0,
      stateChangedAt: data.ebc_state_changed_at
        ? new Date(data.ebc_state_changed_at)
        : new Date(0),
    };

    const next = computeNextState(record, outcome);

    const updates: Record<string, unknown> = {
      ebc_consecutive_losses: next.consecutiveLosses,
      ebc_recovery_wins: next.recoveryWins,
    };
    if (next.state !== record.state) {
      updates.ebc_state = next.state;
      updates.ebc_state_changed_at = next.stateChangedAt.toISOString();
      console.log(
        `[ebc] ${userId} circuit breaker: ${record.state} → ${next.state} (outcome: ${outcome}, losses: ${next.consecutiveLosses})`,
      );
    }

    await sb.from("profiles").update(updates).eq("id", userId);
    return next.state;
  } catch (err) {
    console.error("[ebc] evaluateCircuitBreaker error:", err instanceof Error ? err.message : String(err));
    return "green";
  }
}

/**
 * Manually reset the circuit breaker to green. Called from the dashboard.
 * Only meaningful when state is red (manual reset required).
 */
export async function resetCircuitBreaker(userId: string): Promise<void> {
  try {
    const sb = getServiceClient();
    await sb
      .from("profiles")
      .update({
        ebc_state: "green",
        ebc_consecutive_losses: 0,
        ebc_recovery_wins: 0,
        ebc_state_changed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    console.log(`[ebc] ${userId} circuit breaker manually reset to green`);
  } catch (err) {
    console.error("[ebc] resetCircuitBreaker error:", err instanceof Error ? err.message : String(err));
  }
}
