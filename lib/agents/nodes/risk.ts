/**
 * Risk Management node — position sizing, stop-loss, exposure limits.
 *
 * Mirrors backend/agents/risk/agent.py exactly.
 * Pure deterministic computation — no LLM call.
 */

import type { AtlasState, RiskOutput, TechnicalOutput } from "../state";
import { RiskOutputSchema, validateStateSlice } from "../state";

const MAX_RISK_PER_TRADE = 0.01; // 1% of portfolio at risk per trade (conservative)
const STOP_LOSS_PCT = 0.05; // 5% stop-loss below entry
const MAX_POSITION_PCT = 0.15; // hard cap: no trade exceeds 15% of portfolio value

export function riskNode(state: AtlasState): Partial<AtlasState> {
  const startMs = Date.now();
  const {
    current_price = 0,
    analyst_outputs = {},
    account_info,
  } = state;

  const technical = (analyst_outputs.technical ?? {}) as Partial<TechnicalOutput>;
  const portfolioValue = account_info?.portfolio_value ?? 100_000.0;
  const buyingPower = account_info?.buying_power ?? undefined;

  const support = (technical.key_levels as { support?: number } | undefined)?.support;

  // Stop-loss: use support level if available, else fixed 5%
  let stopLoss: number;
  if (support != null && support < current_price) {
    stopLoss = Math.round(support * 0.99 * 10000) / 10000; // 1% below support
  } else {
    stopLoss = Math.round(current_price * (1 - STOP_LOSS_PCT) * 10000) / 10000;
  }

  const riskPerShare = current_price - stopLoss;
  const maxLossDollars = portfolioValue * MAX_RISK_PER_TRADE;

  let positionSize =
    riskPerShare > 0 ? Math.round(maxLossDollars / riskPerShare) : 0;
  let positionValue = Math.round(positionSize * current_price * 100) / 100;

  // Hard cap: never exceed MAX_POSITION_PCT of portfolio in a single trade
  positionValue = Math.min(positionValue, portfolioValue * MAX_POSITION_PCT);
  // Also cap to available buying power (leave 15% cash reserve)
  if (buyingPower != null) {
    positionValue = Math.min(positionValue, buyingPower * 0.85);
  }
  positionSize =
    current_price > 0
      ? Math.round((positionValue / current_price) * 10000) / 10000
      : 0;

  const positionPct =
    Math.round((positionValue / portfolioValue) * 100 * 100) / 100;
  const takeProfit =
    Math.round((current_price + (current_price - stopLoss) * 2) * 10000) / 10000;
  const riskRewardRatio =
    riskPerShare > 0
      ? Math.round(((takeProfit - current_price) / (current_price - stopLoss)) * 100) / 100
      : 0;

  const result = validateStateSlice<RiskOutput>(
    RiskOutputSchema,
    {
      current_price,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      position_size: Math.floor(positionSize),
      position_value: positionValue,
      position_pct_of_portfolio: positionPct,
      risk_reward_ratio: riskRewardRatio,
      max_loss_dollars: Math.round(maxLossDollars * 100) / 100,
      reasoning:
        `Risk ${MAX_RISK_PER_TRADE * 100}% of portfolio ($${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 0 })} portfolio value, ` +
        `$${maxLossDollars.toLocaleString("en-US", { maximumFractionDigits: 0 })} max loss). ` +
        `Stop at $${stopLoss} (${STOP_LOSS_PCT * 100}% below entry). ` +
        `Target $${takeProfit} gives ${riskRewardRatio}:1 R/R.`,
      latency_ms: Date.now() - startMs,
    },
    "risk",
  );

  return { risk: result };
}
