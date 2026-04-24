/**
 * Shape checks for Atlas broker domain types.
 *
 * These tests verify that the exported types match their documented shape.
 * TypeScript type assertions are used at compile time; runtime checks
 * confirm the values are valid.
 */

import type {
  Account,
  Order,
  OrderAction,
  OrderFilter,
  OrderRequest,
  OrderStatus,
  Position,
} from "../types";

describe("Atlas broker types — shape checks", () => {
  it("OrderRequest has required fields", () => {
    const req: OrderRequest = {
      ticker: "AAPL",
      action: "BUY",
      notional: 1000,
    };
    expect(req.ticker).toBe("AAPL");
    expect(req.action).toBe("BUY");
    expect(req.notional).toBe(1000);
  });

  it("Order has all required fields with correct types", () => {
    const order: Order = {
      orderId: "order-1",
      ticker: "AAPL",
      action: "BUY",
      status: "open",
      notional: 1000,
      qty: null,
    };
    expect(order.orderId).toBe("order-1");
    expect(order.qty).toBeNull();
  });

  it("Position has all required fields with correct types", () => {
    const pos: Position = {
      ticker: "AAPL",
      qty: 10,
      avgCost: 150,
      currentPrice: 160,
      marketValue: 1600,
      unrealizedPl: 100,
    };
    expect(pos.unrealizedPl).toBe(100);
  });

  it("Account has all required fields", () => {
    const acct: Account = {
      equity: 100_000,
      cash: 50_000,
      buyingPower: 200_000,
      portfolioValue: 100_000,
    };
    expect(acct.buyingPower).toBe(200_000);
  });

  it("OrderFilter is optional with optional fields", () => {
    const noFilter: OrderFilter = {};
    const withTicker: OrderFilter = { ticker: "AAPL" };
    const withStatus: OrderFilter = { status: "cancelled" };
    const withBoth: OrderFilter = { ticker: "MSFT", status: "filled" };

    expect(noFilter).toBeDefined();
    expect(withTicker.ticker).toBe("AAPL");
    expect(withStatus.status).toBe("cancelled");
    expect(withBoth.ticker).toBe("MSFT");
  });

  it("OrderAction union covers BUY and SELL", () => {
    const buy: OrderAction = "BUY";
    const sell: OrderAction = "SELL";
    expect([buy, sell]).toEqual(["BUY", "SELL"]);
  });

  it("OrderStatus union covers expected values", () => {
    const statuses: OrderStatus[] = [
      "pending",
      "open",
      "filled",
      "cancelled",
      "expired",
      "rejected",
    ];
    expect(statuses).toHaveLength(6);
  });
});
