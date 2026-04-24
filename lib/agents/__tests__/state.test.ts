/**
 * Zod schema validation tests for AtlasState.
 */

import {
  AtlasStateSchema,
  TechnicalOutputSchema,
  FundamentalOutputSchema,
  SentimentOutputSchema,
  SynthesisOutputSchema,
  RiskOutputSchema,
  PortfolioDecisionSchema,
  validateStateSlice,
} from "../state";
import { z } from "zod";

describe("AtlasStateSchema", () => {
  const validInput = {
    ticker: "AAPL",
    user_id: "user_123",
    boundary_mode: "advisory",
    as_of_date: null,
    philosophy_mode: "balanced",
  };

  it("accepts valid minimal input state", () => {
    const result = AtlasStateSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing ticker", () => {
    const result = AtlasStateSchema.safeParse({ ...validInput, ticker: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing user_id", () => {
    const result = AtlasStateSchema.safeParse({ ...validInput, user_id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid boundary_mode", () => {
    const result = AtlasStateSchema.safeParse({
      ...validInput,
      boundary_mode: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid boundary_mode values", () => {
    for (const mode of ["advisory", "semi-autonomous", "autonomous"]) {
      const result = AtlasStateSchema.safeParse({
        ...validInput,
        boundary_mode: mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid philosophy_mode", () => {
    const result = AtlasStateSchema.safeParse({
      ...validInput,
      philosophy_mode: "unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid philosophy modes", () => {
    for (const mode of ["balanced", "buffett", "soros", "lynch"]) {
      const result = AtlasStateSchema.safeParse({
        ...validInput,
        philosophy_mode: mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts null philosophy_mode", () => {
    const result = AtlasStateSchema.safeParse({
      ...validInput,
      philosophy_mode: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("TechnicalOutputSchema", () => {
  const valid = {
    signal: "BUY",
    indicators: { rsi_14: 45 },
    key_levels: { support: 150, resistance: 160 },
    trend: "bullish",
    reasoning: "Strong momentum.",
    model: "gemini-2.5-flash",
    latency_ms: 500,
  };

  it("accepts valid technical output", () => {
    expect(TechnicalOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid signal", () => {
    expect(
      TechnicalOutputSchema.safeParse({ ...valid, signal: "STRONG_BUY" })
        .success,
    ).toBe(false);
  });

  it("rejects invalid trend", () => {
    expect(
      TechnicalOutputSchema.safeParse({ ...valid, trend: "sideways" }).success,
    ).toBe(false);
  });
});

describe("FundamentalOutputSchema", () => {
  const valid = {
    signal: "HOLD",
    metrics: { pe_ratio: 25 },
    valuation: "fairly_valued",
    upside_to_target_pct: 10.5,
    reasoning: "Fairly valued.",
    model: "gemini-2.5-flash",
    latency_ms: 400,
  };

  it("accepts valid fundamental output", () => {
    expect(FundamentalOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null upside_to_target_pct", () => {
    expect(
      FundamentalOutputSchema.safeParse({
        ...valid,
        upside_to_target_pct: null,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid valuation", () => {
    expect(
      FundamentalOutputSchema.safeParse({ ...valid, valuation: "expensive" })
        .success,
    ).toBe(false);
  });
});

describe("SentimentOutputSchema", () => {
  const valid = {
    signal: "SELL",
    sentiment_score: -0.5,
    dominant_themes: ["earnings miss", "guidance cut"],
    sources: ["news"],
    headline_count: 5,
    reasoning: "Negative news flow.",
    news_articles: [{ title: "AAPL misses", date: "2024-01-01" }],
    model: "gemini-2.5-flash",
    latency_ms: 300,
  };

  it("accepts valid sentiment output", () => {
    expect(SentimentOutputSchema.safeParse(valid).success).toBe(true);
  });
});

describe("SynthesisOutputSchema", () => {
  const valid = {
    bull_case: "Strong growth.",
    bear_case: "Valuation stretched.",
    verdict: "HOLD",
    reasoning: "Mixed signals.",
    model: "gemini-2.5-flash",
    latency_ms: 1000,
  };

  it("accepts valid synthesis output", () => {
    expect(SynthesisOutputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid verdict", () => {
    expect(
      SynthesisOutputSchema.safeParse({ ...valid, verdict: "MAYBE" }).success,
    ).toBe(false);
  });
});

describe("RiskOutputSchema", () => {
  const valid = {
    current_price: 150,
    stop_loss: 142.5,
    take_profit: 165,
    position_size: 10,
    position_value: 1500,
    position_pct_of_portfolio: 1.5,
    risk_reward_ratio: 2,
    max_loss_dollars: 75,
    reasoning: "1% risk rule applied.",
    latency_ms: 5,
  };

  it("accepts valid risk output", () => {
    expect(RiskOutputSchema.safeParse(valid).success).toBe(true);
  });
});

describe("PortfolioDecisionSchema", () => {
  const valid = {
    action: "BUY",
    confidence: 0.75,
    reasoning: "Strong conviction.",
    latency_ms: 800,
  };

  it("accepts valid portfolio decision", () => {
    expect(PortfolioDecisionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects confidence > 1", () => {
    expect(
      PortfolioDecisionSchema.safeParse({ ...valid, confidence: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects confidence < 0", () => {
    expect(
      PortfolioDecisionSchema.safeParse({ ...valid, confidence: -0.1 }).success,
    ).toBe(false);
  });

  it("rejects invalid action", () => {
    expect(
      PortfolioDecisionSchema.safeParse({ ...valid, action: "STRONG_BUY" })
        .success,
    ).toBe(false);
  });
});

describe("validateStateSlice", () => {
  it("returns parsed data for valid input", () => {
    const result = validateStateSlice(
      z.object({ x: z.number() }),
      { x: 42 },
      "test_node",
    );
    expect(result).toEqual({ x: 42 });
  });

  it("throws for invalid input", () => {
    expect(() =>
      validateStateSlice(
        z.object({ x: z.number() }),
        { x: "not a number" },
        "test_node",
      ),
    ).toThrow("[test_node] State validation failed");
  });
});
