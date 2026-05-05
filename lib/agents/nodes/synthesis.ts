/**
 * Synthesis node — aggregates analyst reports, runs bull/bear debate, produces unified thesis.
 *
 * Mirrors backend/agents/synthesis/agent.py exactly.
 */

import type { AtlasState, SynthesisOutput, TechnicalOutput, FundamentalOutput, SentimentOutput, ReviewOutput } from "../state";
import { SynthesisOutputSchema, validateStateSlice, llmConfigFromState } from "../state";
import { getLlm } from "../llm";

export async function synthesisNode(
  state: AtlasState,
): Promise<Partial<AtlasState>> {
  const startMs = Date.now();
  const { ticker, analyst_outputs = {} } = state;

  const technical = (analyst_outputs.technical ?? {}) as Partial<TechnicalOutput>;
  const fundamental = (analyst_outputs.fundamental ?? {}) as Partial<FundamentalOutput>;
  const sentiment = (analyst_outputs.sentiment ?? {}) as Partial<SentimentOutput>;
  const review = analyst_outputs.review as Partial<ReviewOutput> | undefined;

  const signals = [
    technical.signal,
    fundamental.signal,
    sentiment.signal,
  ];
  const signalSummary = `Technical: ${signals[0]} | Fundamental: ${signals[1]} | Sentiment: ${signals[2]}`;

  const reviewSection = review
    ? `\nRetrospective review:
${review.reasoning ?? "N/A"}
Signal bias: ${review.signal_bias ?? "N/A"} | Win rate: ${review.recent_win_rate != null ? `${Math.round(review.recent_win_rate * 100)}%` : "N/A"} | Trades reviewed: ${review.recent_trade_count ?? 0}
Consecutive losses: ${review.consecutive_losses ?? 0} | Consecutive wins: ${review.consecutive_wins ?? 0}
Patterns: ${(review.patterns ?? []).join("; ") || "none"}
`
    : "";

  const analystCount = review ? "four" : "three";

  const prompt = `You are a synthesis agent aggregating ${analystCount} analyst reports for ${ticker} into a unified trading thesis.

${signalSummary}

Technical analysis:
${technical.reasoning ?? "N/A"}
Trend: ${technical.trend ?? "N/A"} | Key levels: ${JSON.stringify((technical.key_levels ?? {}) as Record<string, unknown>)}

Fundamental analysis:
${fundamental.reasoning ?? "N/A"}
Valuation: ${fundamental.valuation ?? "N/A"} | Upside to target: ${fundamental.upside_to_target_pct ?? "N/A"}%

Sentiment analysis:
${sentiment.reasoning ?? "N/A"}
Sentiment score: ${sentiment.sentiment_score ?? "N/A"} | Themes: ${JSON.stringify((sentiment.dominant_themes ?? []) as unknown[])}
${reviewSection}
Construct a bull case and bear case, then give a verdict. Return ONLY valid JSON:
{
  "bull_case": "strongest argument for buying",
  "bear_case": "strongest argument against buying",
  "verdict": "BUY" or "SELL" or "HOLD",
  "reasoning": "2-3 sentence synthesis weighing all ${analystCount} analysts"
}`;

  const llmConfig = llmConfigFromState(state);
  let text = "";
  try {
    const llm = await getLlm("deep", llmConfig);
    const response = await llm.invoke(prompt);
    text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  } catch (err) {
    console.error("[synthesis] LLM error:", err instanceof Error ? err.message : String(err));
  }

  let parsed: Record<string, unknown>;
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(clean) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const modelId = llmConfig?.model ?? "gemini-2.5-flash";

  const result = validateStateSlice<SynthesisOutput>(
    SynthesisOutputSchema,
    {
      bull_case: parsed["bull_case"] ?? "",
      bear_case: parsed["bear_case"] ?? "",
      verdict: parsed["verdict"] ?? "HOLD",
      reasoning: parsed["reasoning"] ?? "",
      model: modelId,
      latency_ms: Date.now() - startMs,
    },
    "synthesis",
  );

  return { synthesis: result };
}
