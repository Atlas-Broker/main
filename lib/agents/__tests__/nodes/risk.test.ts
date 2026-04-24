/**
 * Risk node tests — pure deterministic computation, no LLM.
 */

import { riskNode } from "../../nodes/risk";
import type { AtlasState } from "../../state";

const baseState: AtlasState = {
  ticker: "AAPL",
  user_id: "user_123",
  boundary_mode: "advisory",
  ohlcv: [],
  info: {},
  news: [],
  current_price: 100,
  analyst_outputs: {
    technical: {
      signal: "BUY",
      indicators: {},
      key_levels: { support: 95, resistance: 110 },
      trend: "bullish",
      reasoning: "Test.",
      model: "gemini-2.5-flash",
      latency_ms: 100,
    },
  },
  synthesis: {
    bull_case: "Growth.",
    bear_case: "Risk.",
    verdict: "BUY",
    reasoning: "Balanced.",
    model: "gemini-2.5-flash",
    latency_ms: 500,
  },
  account_info: {
    portfolio_value: 100_000,
    buying_power: 50_000,
    equity: 100_000,
  },
  philosophy_mode: "balanced",
};

describe("riskNode", () => {
  it("returns risk output", () => {
    const result = riskNode(baseState);
    expect(result.risk).toBeDefined();
  });

  it("computes stop_loss from support level when available", () => {
    const result = riskNode(baseState);
    // support=95, current_price=100 → stop = 95 * 0.99 = 94.05
    expect(result.risk?.stop_loss).toBeCloseTo(94.05, 1);
  });

  it("uses fixed 5% stop-loss when no support level", () => {
    const stateNoSupport = {
      ...baseState,
      analyst_outputs: {
        ...baseState.analyst_outputs,
        technical: {
          ...baseState.analyst_outputs!.technical!,
          key_levels: {},
        },
      },
    };
    const result = riskNode(stateNoSupport);
    // 5% below 100 = 95.0
    expect(result.risk?.stop_loss).toBeCloseTo(95.0, 1);
  });

  it("hard-caps position to 15% of portfolio", () => {
    const largePortfolioState = {
      ...baseState,
      account_info: {
        portfolio_value: 10_000_000,
        buying_power: 5_000_000,
        equity: 10_000_000,
      },
    };
    const result = riskNode(largePortfolioState);
    expect(result.risk?.position_pct_of_portfolio).toBeLessThanOrEqual(15.01);
  });

  it("respects buying_power cap (85% of buying power)", () => {
    const lowBpState = {
      ...baseState,
      account_info: {
        portfolio_value: 100_000,
        buying_power: 5_000,
        equity: 100_000,
      },
    };
    const result = riskNode(lowBpState);
    // position_value ≤ 5000 * 0.85 = 4250
    expect(result.risk?.position_value).toBeLessThanOrEqual(4251);
  });

  it("computes 2:1 risk-reward take_profit", () => {
    const result = riskNode(baseState);
    const risk = result.risk!;
    const riskPerShare = risk.current_price - risk.stop_loss;
    const expectedTakeProfit = risk.current_price + riskPerShare * 2;
    expect(risk.take_profit).toBeCloseTo(expectedTakeProfit, 1);
  });

  it("outputs valid RiskOutput shape", () => {
    const result = riskNode(baseState);
    const r = result.risk!;
    expect(typeof r.current_price).toBe("number");
    expect(typeof r.stop_loss).toBe("number");
    expect(typeof r.take_profit).toBe("number");
    expect(typeof r.position_size).toBe("number");
    expect(typeof r.position_value).toBe("number");
    expect(typeof r.risk_reward_ratio).toBe("number");
    expect(typeof r.max_loss_dollars).toBe("number");
    expect(typeof r.reasoning).toBe("string");
  });
});
