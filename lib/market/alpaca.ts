/**
 * Market data via @alpacahq/alpaca-trade-api — OHLCV bars and news.
 *
 * Requires env vars: ALPACA_API_KEY, ALPACA_SECRET_KEY
 */
import Alpaca from "@alpacahq/alpaca-trade-api";
import type { Bar, FetchNewsOptions, NewsItem } from "./types";

function createClient(): InstanceType<typeof Alpaca> {
  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) {
    throw new Error("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set");
  }
  return new Alpaca({ keyId, secretKey, paper: true });
}

/**
 * Fetch OHLCV bars for a ticker over a date range.
 *
 * @param ticker  - Stock symbol e.g. "AAPL"
 * @param start   - ISO date/datetime string for the start of the range
 * @param end     - ISO date/datetime string for the end of the range
 * @param timeframe - Alpaca timeframe string e.g. "1Day", "1Hour" (default: "1Day")
 */
export async function fetchBars(
  ticker: string,
  start: string,
  end: string,
  timeframe: string = "1Day"
): Promise<Bar[]> {
  const client = createClient();
  const bars: Bar[] = [];

  try {
    const generator = client.getBarsV2(ticker, { start, end, timeframe, feed: "iex" }) as AsyncGenerator<{
      Timestamp: string;
      OpenPrice: number;
      HighPrice: number;
      LowPrice: number;
      ClosePrice: number;
      Volume: number;
    }>;

    for await (const bar of generator) {
      bars.push({
        date: bar.Timestamp.slice(0, 10),
        open: bar.OpenPrice,
        high: bar.HighPrice,
        low: bar.LowPrice,
        close: bar.ClosePrice,
        volume: bar.Volume,
      });
    }
  } catch (err) {
    console.error(`fetchBars failed for ${ticker}:`, err);
    return [];
  }

  return bars;
}

/**
 * Fetch recent news for a ticker.
 *
 * - Backtest path: pass `opts.end` to get articles published before that date.
 * - Live path: omit `opts.end`; defaults to start = (now - 7 days).
 *
 * @param ticker - Stock symbol e.g. "AAPL"
 * @param opts   - Optional { end, limit }
 */
export async function fetchNews(
  ticker: string,
  opts: FetchNewsOptions = {}
): Promise<NewsItem[]> {
  const client = createClient();
  const limit = opts.limit ?? 10;

  const newsOptions: Record<string, unknown> = {
    symbols: [ticker],
    limit,
  };

  if (opts.end) {
    newsOptions.end = opts.end;
  } else {
    // Live path: last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    newsOptions.start = sevenDaysAgo.toISOString();
  }

  try {
    const articles = await client.getNews(newsOptions) as Array<{
      Headline: string;
      CreatedAt: string;
    }>;

    return articles.map((a) => ({
      title: a.Headline,
      published: a.CreatedAt,
    }));
  } catch (err) {
    console.error(`fetchNews failed for ${ticker}:`, err);
    return [];
  }
}
