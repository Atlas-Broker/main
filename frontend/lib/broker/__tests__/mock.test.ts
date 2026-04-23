/**
 * Unit tests for MockBrokerAdapter.
 *
 * Covers all 5 BrokerAdapter methods and the full order lifecycle:
 *   submit → listOrders (see it) → cancelOrder → listOrders (see it cancelled)
 */

import { MockBrokerAdapter } from "../mock";
import { BrokerError } from "../base";

describe("MockBrokerAdapter", () => {
  let adapter: MockBrokerAdapter;

  beforeEach(() => {
    adapter = new MockBrokerAdapter();
  });

  // ---------------------------------------------------------------------------
  // submitOrder
  // ---------------------------------------------------------------------------
  describe("submitOrder", () => {
    it("returns a well-formed Order with status 'open'", async () => {
      const order = await adapter.submitOrder({
        ticker: "AAPL",
        action: "BUY",
        notional: 1000,
      });

      expect(order.orderId).toMatch(/^mock-order-/);
      expect(order.ticker).toBe("AAPL");
      expect(order.action).toBe("BUY");
      expect(order.status).toBe("open");
      expect(order.notional).toBe(1000);
      expect(order.qty).toBeNull();
    });

    it("upcases the ticker", async () => {
      const order = await adapter.submitOrder({
        ticker: "msft",
        action: "SELL",
        notional: 500,
      });
      expect(order.ticker).toBe("MSFT");
    });

    it("throws BrokerError for empty ticker", async () => {
      await expect(
        adapter.submitOrder({ ticker: "", action: "BUY", notional: 100 }),
      ).rejects.toThrow(BrokerError);
    });

    it("throws BrokerError for non-positive notional", async () => {
      await expect(
        adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 0 }),
      ).rejects.toThrow(BrokerError);
    });

    it("assigns unique IDs to multiple orders", async () => {
      const a = await adapter.submitOrder({
        ticker: "AAPL",
        action: "BUY",
        notional: 100,
      });
      const b = await adapter.submitOrder({
        ticker: "AAPL",
        action: "BUY",
        notional: 100,
      });
      expect(a.orderId).not.toBe(b.orderId);
    });
  });

  // ---------------------------------------------------------------------------
  // getPositions
  // ---------------------------------------------------------------------------
  describe("getPositions", () => {
    it("returns an array with the expected shape", async () => {
      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);

      const [first] = positions;
      expect(typeof first.ticker).toBe("string");
      expect(typeof first.qty).toBe("number");
      expect(typeof first.avgCost).toBe("number");
      expect(typeof first.currentPrice).toBe("number");
      expect(typeof first.marketValue).toBe("number");
      expect(typeof first.unrealizedPl).toBe("number");
    });
  });

  // ---------------------------------------------------------------------------
  // getAccount
  // ---------------------------------------------------------------------------
  describe("getAccount", () => {
    it("returns account with numeric fields", async () => {
      const account = await adapter.getAccount();
      expect(typeof account.equity).toBe("number");
      expect(typeof account.cash).toBe("number");
      expect(typeof account.buyingPower).toBe("number");
      expect(typeof account.portfolioValue).toBe("number");
      expect(account.equity).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // listOrders
  // ---------------------------------------------------------------------------
  describe("listOrders", () => {
    it("returns empty array when no orders submitted", async () => {
      const orders = await adapter.listOrders();
      expect(orders).toEqual([]);
    });

    it("returns submitted orders", async () => {
      await adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 100 });
      await adapter.submitOrder({ ticker: "MSFT", action: "SELL", notional: 200 });

      const orders = await adapter.listOrders();
      expect(orders).toHaveLength(2);
    });

    it("filters by ticker", async () => {
      await adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 100 });
      await adapter.submitOrder({ ticker: "MSFT", action: "BUY", notional: 100 });

      const appleOrders = await adapter.listOrders({ ticker: "AAPL" });
      expect(appleOrders).toHaveLength(1);
      expect(appleOrders[0].ticker).toBe("AAPL");
    });

    it("filters by ticker case-insensitively", async () => {
      await adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 100 });

      const orders = await adapter.listOrders({ ticker: "aapl" });
      expect(orders).toHaveLength(1);
    });

    it("filters by status", async () => {
      await adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 100 });
      const [order] = await adapter.listOrders();
      await adapter.cancelOrder(order.orderId);

      const openOrders = await adapter.listOrders({ status: "open" });
      const cancelledOrders = await adapter.listOrders({ status: "cancelled" });

      expect(openOrders).toHaveLength(0);
      expect(cancelledOrders).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // cancelOrder
  // ---------------------------------------------------------------------------
  describe("cancelOrder", () => {
    it("marks order as cancelled", async () => {
      const submitted = await adapter.submitOrder({
        ticker: "AAPL",
        action: "BUY",
        notional: 500,
      });

      await adapter.cancelOrder(submitted.orderId);

      const [updated] = await adapter.listOrders();
      expect(updated.status).toBe("cancelled");
    });

    it("throws BrokerError for unknown orderId", async () => {
      await expect(adapter.cancelOrder("does-not-exist")).rejects.toThrow(
        BrokerError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Full order lifecycle
  // ---------------------------------------------------------------------------
  describe("full order lifecycle", () => {
    it("submit → listOrders (open) → cancelOrder → listOrders (cancelled)", async () => {
      // 1. Submit
      const order = await adapter.submitOrder({
        ticker: "NVDA",
        action: "BUY",
        notional: 2000,
      });
      expect(order.status).toBe("open");

      // 2. Verify visible in list
      const openOrders = await adapter.listOrders({ status: "open" });
      expect(openOrders.map((o) => o.orderId)).toContain(order.orderId);

      // 3. Cancel
      await adapter.cancelOrder(order.orderId);

      // 4. No longer open
      const stillOpen = await adapter.listOrders({ status: "open" });
      expect(stillOpen.map((o) => o.orderId)).not.toContain(order.orderId);

      // 5. Appears as cancelled
      const cancelledOrders = await adapter.listOrders({ status: "cancelled" });
      expect(cancelledOrders.map((o) => o.orderId)).toContain(order.orderId);
    });
  });

  // ---------------------------------------------------------------------------
  // Immutability — returned objects should not share references
  // ---------------------------------------------------------------------------
  describe("immutability", () => {
    it("listOrders returns copies, not stored references", async () => {
      await adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 100 });

      const [a] = await adapter.listOrders();
      // Mutate the returned copy
      (a as { status: string }).status = "filled";

      const [b] = await adapter.listOrders();
      expect(b.status).toBe("open");
    });
  });
});
