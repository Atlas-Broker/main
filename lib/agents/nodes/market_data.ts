/**
 * market_data node — fetches OHLCV, fundamentals, and news via lib/market.
 *
 * Mirrors backend/agents/graph.py::fetch_data node.
 * Populates: ohlcv, info, news, current_price, analyst_outputs (empty merge seed).
 */

import { fetchBars, fetchNews, fetchTickerInfo } from "@/lib/market";
import type { AtlasState, AnalystOutputs } from "../state";
import { validateStateSlice, AnalystOutputsSchema } from "../state";

/**
 * Compute the date 90 days before a given ISO date string.
 */
function ninetyDaysBefore(isoDate: string): string {
  const end = new Date(isoDate);
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return start.toISOString().slice(0, 10);
}

/**
 * market_data node.
 *
 * When as_of_date is set, fetches data up to that date (backtest path).
 * Otherwise fetches the latest 90 days (live path).
 */
export async function marketDataNode(
  state: AtlasState,
): Promise<Partial<AtlasState>> {
  const { ticker, as_of_date } = state;

  let bars;
  let newsItems;

  if (as_of_date) {
    const start = ninetyDaysBefore(as_of_date);
    [bars, newsItems] = await Promise.all([
      fetchBars(ticker, start, as_of_date, "1Day"),
      fetchNews(ticker, { end: as_of_date, limit: 10 }),
    ]);
  } else {
    const end = new Date().toISOString().slice(0, 10);
    const start = ninetyDaysBefore(end);
    [bars, newsItems] = await Promise.all([
      fetchBars(ticker, start, end, "1Day"),
      fetchNews(ticker, { limit: 10 }),
    ]);
  }

  const info = await fetchTickerInfo(ticker);

  const currentPrice =
    info.currentPrice ??
    (bars.length > 0 ? bars[bars.length - 1].close : 0);

  // Provide an empty analyst_outputs seed so LangGraph reducer merges correctly
  const analystOutputs = validateStateSlice<AnalystOutputs>(
    AnalystOutputsSchema,
    {},
    "market_data",
  );

  return {
    ohlcv: bars,
    info,
    news: newsItems,
    current_price: currentPrice,
    analyst_outputs: analystOutputs,
    as_of_date: as_of_date ?? null,
  };
}
