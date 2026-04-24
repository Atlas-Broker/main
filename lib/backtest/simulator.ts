/**
 * Virtual portfolio simulator for backtesting.
 *
 * Mirrors EBC execution thresholds from boundary/modes without touching the
 * real broker. Uses a single shared capital pool across tickers.
 *
 * Port of backend/backtesting/simulator.py.
 */

const NOTIONAL = 1000.0; // $1,000 per trade — matches live EBC config
const MAX_POSITION_PCT = 0.15; // no single ticker exceeds 15% of total portfolio at cost basis
const MIN_CASH_RESERVE_PCT = 0.1; // always keep 10% of portfolio in cash as dry powder

const CONFIDENCE_THRESHOLDS: Record<string, number | null> = {
  advisory: null, // never execute
  autonomous: 0.65,
  autonomous_guardrail: 0.65,
};

export interface Position {
  ticker: string;
  shares: number;
  avgCost: number;
  entryDate: string;
}

export interface TradeResult {
  executed: boolean;
  action?: "BUY" | "SELL";
  shares?: number;
  price?: number;
  notional?: number;
  pnl?: number;
  reason?: string;
  skippedReason?: string;
}

export class VirtualPortfolio {
  cash: number;
  positions: Map<string, Position>;
  readonly initialCapital: number;

  constructor(initialCapital = 10_000.0) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
    this.positions = new Map();
  }

  process({
    date,
    ticker,
    action,
    confidence,
    ebcMode,
    executionPrice,
    isLastDay,
    confidenceThresholdOverride,
    positionValueOverride,
  }: {
    date: string;
    ticker: string;
    action: string;
    confidence: number;
    ebcMode: string;
    executionPrice: number | null;
    isLastDay: boolean;
    confidenceThresholdOverride?: number | null;
    positionValueOverride?: number | null;
  }): TradeResult {
    const threshold =
      confidenceThresholdOverride !== undefined && confidenceThresholdOverride !== null
        ? confidenceThresholdOverride
        : CONFIDENCE_THRESHOLDS[ebcMode] ?? null;

    if (threshold === null) return { executed: false, reason: "advisory_mode" };
    if (isLastDay) return { executed: false, skippedReason: "end_of_range" };
    if (action === "HOLD") return { executed: false, reason: "hold_signal" };
    if (confidence < threshold) return { executed: false, reason: "below_threshold" };
    if (executionPrice === null) return { executed: false, reason: "no_price_data" };

    if (action === "BUY") {
      return this._executeBuy(date, ticker, executionPrice, positionValueOverride ?? undefined);
    }
    if (action === "SELL") {
      return this._executeSell(ticker, executionPrice);
    }
    return { executed: false, reason: "unknown_action" };
  }

  private _executeBuy(
    date: string,
    ticker: string,
    price: number,
    notional?: number,
  ): TradeResult {
    let tradeNotional = notional !== undefined ? notional : NOTIONAL;

    if (tradeNotional > 0 && price > 0) {
      const totalPortfolio =
        this.cash +
        Array.from(this.positions.values()).reduce(
          (sum, pos) => sum + pos.shares * pos.avgCost,
          0,
        );

      const existing = this.positions.get(ticker);
      const existingCost = existing ? existing.shares * existing.avgCost : 0;
      const maxNotional = totalPortfolio * MAX_POSITION_PCT;
      const remainingCapacity = Math.max(0, maxNotional - existingCost);
      tradeNotional = Math.min(tradeNotional, remainingCapacity);

      const minCash = totalPortfolio * MIN_CASH_RESERVE_PCT;
      const maxSpend = Math.max(0, this.cash - minCash);
      tradeNotional = Math.min(tradeNotional, maxSpend);
    }

    if (tradeNotional <= 0) {
      return { executed: false, skippedReason: "position_cap_reached" };
    }
    if (this.cash < tradeNotional) {
      return { executed: false, skippedReason: "insufficient_funds" };
    }

    const shares = tradeNotional / price;
    this.cash -= tradeNotional;

    const existing = this.positions.get(ticker);
    if (existing) {
      const total = existing.shares + shares;
      const avgCost = (existing.shares * existing.avgCost + shares * price) / total;
      this.positions.set(ticker, { ticker, shares: total, avgCost, entryDate: existing.entryDate });
    } else {
      this.positions.set(ticker, { ticker, shares, avgCost: price, entryDate: date });
    }

    return { executed: true, action: "BUY", shares, price, notional: tradeNotional };
  }

  private _executeSell(ticker: string, price: number): TradeResult {
    const pos = this.positions.get(ticker);
    if (!pos) return { executed: false, reason: "no_position" };

    const proceeds = pos.shares * price;
    this.cash += proceeds;
    const pnl = (price - pos.avgCost) * pos.shares;
    this.positions.delete(ticker);

    return { executed: true, action: "SELL", shares: pos.shares, price, pnl };
  }

  portfolioValue(currentPrices: Record<string, number>): number {
    const positionValue = Array.from(this.positions.values()).reduce(
      (sum, pos) => sum + pos.shares * (currentPrices[pos.ticker] ?? pos.avgCost),
      0,
    );
    return this.cash + positionValue;
  }

  markToMarket(currentPrices: Record<string, number>): TradeResult[] {
    const results: TradeResult[] = [];
    for (const [ticker, pos] of this.positions) {
      const price = currentPrices[ticker] ?? pos.avgCost;
      this.cash += pos.shares * price;
      const pnl = (price - pos.avgCost) * pos.shares;
      results.push({ executed: true, action: "SELL", shares: pos.shares, price, pnl });
    }
    this.positions.clear();
    return results;
  }
}
