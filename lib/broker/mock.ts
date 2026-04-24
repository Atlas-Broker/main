/**
 * MockBrokerAdapter — in-memory broker for backtest mode and unit tests.
 *
 * Never calls Alpaca or any external API.
 * Returns shape-compatible fake data for all 5 BrokerAdapter methods.
 */

import { BrokerAdapter, BrokerError } from "./base";
import type { Account, Order, OrderFilter, OrderRequest, Position } from "./types";

let nextOrderSeq = 1;

function generateOrderId(): string {
  return `mock-order-${nextOrderSeq++}`;
}

export class MockBrokerAdapter implements BrokerAdapter {
  private readonly orders: Map<string, Order> = new Map();

  /**
   * Place a market order. Stores the order in memory and returns it.
   */
  async submitOrder(request: OrderRequest): Promise<Order> {
    if (!request.ticker || request.ticker.trim() === "") {
      throw new BrokerError("submitOrder: ticker must not be empty");
    }
    if (request.notional <= 0) {
      throw new BrokerError(
        `submitOrder: notional must be positive, got ${request.notional}`,
      );
    }

    const order: Order = {
      orderId: generateOrderId(),
      ticker: request.ticker.toUpperCase(),
      action: request.action,
      status: "open",
      notional: request.notional,
      qty: null,
      createdAt: new Date().toISOString(),
    };

    this.orders.set(order.orderId, order);
    return { ...order };
  }

  /**
   * Return a static list of fake open positions.
   */
  async getPositions(): Promise<Position[]> {
    return [
      {
        ticker: "AAPL",
        qty: 10,
        avgCost: 150.0,
        currentPrice: 160.0,
        marketValue: 1600.0,
        unrealizedPl: 100.0,
      },
      {
        ticker: "MSFT",
        qty: 5,
        avgCost: 300.0,
        currentPrice: 310.0,
        marketValue: 1550.0,
        unrealizedPl: 50.0,
      },
    ];
  }

  /**
   * Return fake account summary data.
   */
  async getAccount(): Promise<Account> {
    return {
      equity: 100_000.0,
      cash: 50_000.0,
      buyingPower: 200_000.0,
      portfolioValue: 100_000.0,
    };
  }

  /**
   * Mark an order as cancelled.
   *
   * @throws {BrokerError} if the orderId is not found.
   */
  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new BrokerError(
        `cancelOrder: order "${orderId}" not found`,
      );
    }
    this.orders.set(orderId, { ...order, status: "cancelled" });
  }

  /**
   * List stored orders, optionally filtered by ticker and/or status.
   */
  async listOrders(filter?: OrderFilter): Promise<Order[]> {
    let results = Array.from(this.orders.values());

    if (filter?.ticker !== undefined) {
      const upper = filter.ticker.toUpperCase();
      results = results.filter((o) => o.ticker === upper);
    }

    if (filter?.status !== undefined) {
      results = results.filter((o) => o.status === filter.status);
    }

    return results.map((o) => ({ ...o }));
  }

  /**
   * Remove all stored orders. Useful for resetting state between tests.
   */
  reset(): void {
    this.orders.clear();
  }
}
