/**
 * Sentiment analyst node tests.
 * Mocks the LLM — no real API calls.
 */

import { sentimentAnalystNode } from "../../nodes/sentiment_analyst";
import type { AtlasState } from "../../state";

jest.mock("../../llm", () => ({
  getLlm: jest.fn().mockReturnValue({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        signal: "HOLD",
        sentiment_score: 0.2,
        reasoning: "Mixed news flow.",
        dominant_themes: ["AI", "earnings"],
      }),
    }),
  }),
}));

const mockNews = [
  { title: "Apple beats earnings expectations", published: "2024-01-15" },
  { title: "Apple faces regulatory scrutiny", published: "2024-01-14" },
  { title: "New iPhone models coming in fall", published: "2024-01-13" },
];

const baseState: AtlasState = {
  ticker: "AAPL",
  user_id: "user_123",
  boundary_mode: "advisory",
  ohlcv: [],
  info: {},
  news: mockNews,
  current_price: 175,
  analyst_outputs: {},
  philosophy_mode: "balanced",
};

describe("sentimentAnalystNode", () => {
  it("returns analyst_outputs with sentiment key", async () => {
    const result = await sentimentAnalystNode(baseState);
    expect(result.analyst_outputs?.sentiment).toBeDefined();
  });

  it("output passes SentimentOutputSchema validation", async () => {
    const result = await sentimentAnalystNode(baseState);
    const sent = result.analyst_outputs?.sentiment;
    expect(sent?.signal).toMatch(/^(BUY|SELL|HOLD)$/);
    expect(typeof sent?.sentiment_score).toBe("number");
    expect(Array.isArray(sent?.dominant_themes)).toBe(true);
  });

  it("counts headlines correctly", async () => {
    const result = await sentimentAnalystNode(baseState);
    expect(result.analyst_outputs?.sentiment?.headline_count).toBe(3);
  });

  it("handles empty news gracefully", async () => {
    const result = await sentimentAnalystNode({ ...baseState, news: [] });
    expect(result.analyst_outputs?.sentiment?.headline_count).toBe(0);
  });

  it("includes news_articles in output", async () => {
    const result = await sentimentAnalystNode(baseState);
    const articles = result.analyst_outputs?.sentiment?.news_articles;
    expect(Array.isArray(articles)).toBe(true);
    expect(articles?.length).toBeGreaterThan(0);
  });
});
