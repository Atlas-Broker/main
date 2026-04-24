/**
 * Technical analyst node tests.
 * Mocks the LLM — no real API calls.
 */

import { technicalAnalystNode } from "../../nodes/technical_analyst";
import type { AtlasState } from "../../state";

// Mock the LLM module
jest.mock("../../llm", () => ({
  getLlm: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        signal: "BUY",
        reasoning: "Strong uptrend with RSI not overbought.",
        key_levels: { support: 145, resistance: 165 },
        trend: "bullish",
      }),
    }),
  }),
}));

const mockOhlcv = Array.from({ length: 25 }, (_, i) => ({
  date: `2024-01-${String(i + 1).padStart(2, "0")}`,
  open: 150 + i,
  high: 155 + i,
  low: 148 + i,
  close: 152 + i,
  volume: 10_000_000 + i * 100_000,
}));

const baseState: AtlasState = {
  ticker: "AAPL",
  user_id: "user_123",
  boundary_mode: "advisory",
  ohlcv: mockOhlcv,
  info: {},
  news: [],
  current_price: 176,
  analyst_outputs: {},
  philosophy_mode: "balanced",
};

describe("technicalAnalystNode", () => {
  it("returns analyst_outputs with technical key", async () => {
    const result = await technicalAnalystNode(baseState);
    expect(result.analyst_outputs).toBeDefined();
    expect(result.analyst_outputs?.technical).toBeDefined();
  });

  it("output passes TechnicalOutputSchema validation", async () => {
    const result = await technicalAnalystNode(baseState);
    const tech = result.analyst_outputs?.technical;
    expect(tech?.signal).toMatch(/^(BUY|SELL|HOLD)$/);
    expect(tech?.trend).toMatch(/^(bullish|bearish|neutral)$/);
    expect(typeof tech?.reasoning).toBe("string");
    expect(typeof tech?.latency_ms).toBe("number");
  });

  it("includes computed indicators in output", async () => {
    const result = await technicalAnalystNode(baseState);
    const indicators = result.analyst_outputs?.technical?.indicators;
    expect(indicators).toBeDefined();
    expect(typeof (indicators as Record<string, unknown>)?.rsi_14).toBe("number");
  });

  it("handles short ohlcv with empty indicators", async () => {
    const shortState = { ...baseState, ohlcv: mockOhlcv.slice(0, 5) };
    const result = await technicalAnalystNode(shortState);
    expect(result.analyst_outputs?.technical).toBeDefined();
  });

  it("prepends philosophy prefix for non-balanced modes", async () => {
    const { getLlm } = jest.requireMock("../../llm") as { getLlm: jest.Mock };
    const mockInvoke = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        signal: "HOLD",
        reasoning: "Buffett would wait.",
        key_levels: { support: 140, resistance: 160 },
        trend: "neutral",
      }),
    });
    getLlm.mockReturnValue({ invoke: mockInvoke });

    await technicalAnalystNode({ ...baseState, philosophy_mode: "buffett" });

    const promptArg = mockInvoke.mock.calls[0][0] as string;
    expect(promptArg).toContain("[Investment Philosophy: Buffett]");
  });
});
