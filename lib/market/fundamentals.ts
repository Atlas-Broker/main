/**
 * Fundamental data via yahoo-finance2 v3.
 *
 * IMPORTANT: yahoo-finance2 v3 requires constructor instantiation.
 * Do NOT use the old v2 default import pattern.
 */
import YahooFinance from "yahoo-finance2";
import type { AtlasTickerInfo } from "./types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/**
 * Module set required to cover all 18 `_INFO_KEYS`.
 * Derived from `frontend/lib/probe-yahoo.ts::FIELD_PATHS`.
 */
const REQUIRED_MODULES = [
  "assetProfile",
  "price",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
] as const;

/** Extract a value that may be present as null or a number. */
function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/** Extract a value that may be present as null or a string. */
function toNullableString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return typeof val === "string" ? val : String(val);
}

/**
 * Fetch all 18 fundamental fields for a ticker.
 * Returns an object with `null` for any field that is unavailable —
 * never throws (sector-specific nulls like JPM debtToEquity are expected).
 */
export async function fetchTickerInfo(ticker: string): Promise<AtlasTickerInfo> {
  const empty: AtlasTickerInfo = {
    shortName: null,
    sector: null,
    industry: null,
    trailingPE: null,
    forwardPE: null,
    priceToBook: null,
    revenueGrowth: null,
    earningsGrowth: null,
    profitMargins: null,
    debtToEquity: null,
    returnOnEquity: null,
    currentRatio: null,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    currentPrice: null,
    targetMeanPrice: null,
    recommendationMean: null,
  };

  try {
    const q = await (yf.quoteSummary as (t: string, opts: unknown) => Promise<any>)(ticker, {
      modules: REQUIRED_MODULES,
    });

    return {
      // assetProfile
      shortName: toNullableString(q?.price?.shortName),
      sector: toNullableString(q?.assetProfile?.sector),
      industry: toNullableString(q?.assetProfile?.industry),

      // defaultKeyStatistics (fallback summaryDetail)
      trailingPE: toNullableNumber(
        (q?.defaultKeyStatistics as any)?.trailingPE ??
        (q?.summaryDetail as any)?.trailingPE
      ),
      forwardPE: toNullableNumber(
        (q?.defaultKeyStatistics as any)?.forwardPE ??
        (q?.summaryDetail as any)?.forwardPE
      ),
      priceToBook: toNullableNumber((q?.defaultKeyStatistics as any)?.priceToBook),

      // financialData
      revenueGrowth: toNullableNumber((q?.financialData as any)?.revenueGrowth),
      earningsGrowth: toNullableNumber((q?.financialData as any)?.earningsGrowth),
      profitMargins: toNullableNumber(
        (q?.financialData as any)?.profitMargins ??
        (q?.defaultKeyStatistics as any)?.profitMargins
      ),
      debtToEquity: toNullableNumber((q?.financialData as any)?.debtToEquity),
      returnOnEquity: toNullableNumber((q?.financialData as any)?.returnOnEquity),
      currentRatio: toNullableNumber((q?.financialData as any)?.currentRatio),

      // price / summaryDetail
      marketCap: toNullableNumber(
        (q?.price as any)?.marketCap ??
        (q?.summaryDetail as any)?.marketCap
      ),
      fiftyTwoWeekHigh: toNullableNumber((q?.summaryDetail as any)?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: toNullableNumber((q?.summaryDetail as any)?.fiftyTwoWeekLow),

      // financialData (fallback price.regularMarketPrice)
      currentPrice: toNullableNumber(
        (q?.financialData as any)?.currentPrice ??
        (q?.price as any)?.regularMarketPrice
      ),
      targetMeanPrice: toNullableNumber((q?.financialData as any)?.targetMeanPrice),
      recommendationMean: toNullableNumber((q?.financialData as any)?.recommendationMean),
    };
  } catch {
    return empty;
  }
}
