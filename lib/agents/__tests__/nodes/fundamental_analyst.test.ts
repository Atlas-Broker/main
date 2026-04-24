/**
 * Fundamental analyst node tests.
 * Mocks the LLM — no real API calls.
 */

import { fundamentalAnalystNode } from "../../nodes/fundamental_analyst";
import type { AtlasState } from "../../state";

jest.mock("../../llm", () => ({
  getLlm: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        signal: "BUY",
        reasoning: "Trading below intrinsic value.",
        valuation: "undervalued",
        upside_to_target_pct: 15.5,
      }),
    }),
  }),
}));

const baseState: AtlasState = {
  ticker: "AAPL",
  user_id: "user_123",
  boundary_mode: "advisory",
  ohlcv: [],
  info: {
    shortName: "Apple Inc.",
    sector: "Technology",
    industry: "Consumer Electronics",
    trailingPE: 25,
    forwardPE: 22,
    priceToBook: 35,
    revenueGrowth: 0.08,
    earningsGrowth: 0.12,
    profitMargins: 0.25,
    debtToEquity: 150,
    returnOnEquity: 1.7,
    currentRatio: 1.1,
    marketCap: 2_800_000_000_000,
    fiftyTwoWeekHigh: 200,
    fiftyTwoWeekLow: 140,
    currentPrice: 175,
    targetMeanPrice: 201.5,
    recommendationMean: 1.8,
  },
  news: [],
  current_price: 175,
  analyst_outputs: {},
  philosophy_mode: "balanced",
};

describe("fundamentalAnalystNode", () => {
  it("returns analyst_outputs with fundamental key", async () => {
    const result = await fundamentalAnalystNode(baseState);
    expect(result.analyst_outputs?.fundamental).toBeDefined();
  });

  it("computes upside_to_target_pct from info when available", async () => {
    const result = await fundamentalAnalystNode(baseState);
    const fund = result.analyst_outputs?.fundamental;
    // currentPrice=175, targetMeanPrice=201.5 → upside ≈ 15.14%
    expect(fund?.upside_to_target_pct).toBeCloseTo(15.14, 0);
  });

  it("output passes FundamentalOutputSchema validation", async () => {
    const result = await fundamentalAnalystNode(baseState);
    const fund = result.analyst_outputs?.fundamental;
    expect(fund?.signal).toMatch(/^(BUY|SELL|HOLD)$/);
    expect(fund?.valuation).toMatch(/^(undervalued|fairly_valued|overvalued)$/);
    expect(typeof fund?.reasoning).toBe("string");
  });

  it("includes extracted metrics in output", async () => {
    const result = await fundamentalAnalystNode(baseState);
    const metrics = result.analyst_outputs?.fundamental?.metrics as Record<string, unknown>;
    expect(metrics?.pe_ratio).toBe(25);
    expect(metrics?.profit_margins).toBe(0.25);
  });
});
