/**
 * Unit tests for AlpacaAdapter.
 *
 * The @alpacahq/alpaca-trade-api SDK is mocked so no real HTTP calls are made.
 * Tests verify:
 *   - correct params are forwarded to the SDK
 *   - SDK responses are normalised to Atlas domain types
 *   - SDK errors are wrapped in BrokerError
 */

import { AlpacaAdapter } from "../alpaca";
import { BrokerError } from "../base";

// ---------------------------------------------------------------------------
// Mock the SDK
// ---------------------------------------------------------------------------
const mockCreateOrder = jest.fn();
const mockGetPositions = jest.fn();
const mockGetAccount = jest.fn();
const mockCancelOrder = jest.fn();
const mockGetOrders = jest.fn();

jest.mock("@alpacahq/alpaca-trade-api", () => {
  return jest.fn().mockImplementation(() => ({
    createOrder: mockCreateOrder,
    getPositions: mockGetPositions,
    getAccount: mockGetAccount,
    cancelOrder: mockCancelOrder,
    getOrders: mockGetOrders,
  }));
});

// ---------------------------------------------------------------------------
// Helpers for fake SDK responses
// ---------------------------------------------------------------------------
function makeSdkOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sdk-order-123",
    symbol: "AAPL",
    side: "buy",
    status: "new",
    notional: "1000",
    qty: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSdkPosition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: "AAPL",
    qty: "10",
    avg_entry_price: "150.00",
    current_price: "160.00",
    market_value: "1600.00",
    unrealized_pl: "100.00",
    ...overrides,
  };
}

function makeSdkAccount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    equity: "100000.00",
    cash: "50000.00",
    buying_power: "200000.00",
    portfolio_value: "100000.00",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AlpacaAdapter", () => {
  let adapter: AlpacaAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AlpacaAdapter("test-key", "test-secret", true);
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe("constructor", () => {
    it("throws BrokerError when apiKey is missing", () => {
      expect(() => new AlpacaAdapter("", "secret", true)).toThrow(BrokerError);
    });

    it("throws BrokerError when secretKey is missing", () => {
      expect(() => new AlpacaAdapter("key", "", true)).toThrow(BrokerError);
    });
  });

  // ---------------------------------------------------------------------------
  // submitOrder
  // ---------------------------------------------------------------------------
  describe("submitOrder", () => {
    it("calls createOrder with correct params", async () => {
      mockCreateOrder.mockResolvedValueOnce(makeSdkOrder());

      await adapter.submitOrder({ ticker: "aapl", action: "BUY", notional: 1000 });

      expect(mockCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: "AAPL",
          side: "buy",
          type: "market",
          time_in_force: "day",
        }),
      );
    });

    it("normalises response to Atlas Order type", async () => {
      mockCreateOrder.mockResolvedValueOnce(makeSdkOrder());

      const order = await adapter.submitOrder({
        ticker: "AAPL",
        action: "BUY",
        notional: 1000,
      });

      expect(order.orderId).toBe("sdk-order-123");
      expect(order.ticker).toBe("AAPL");
      expect(order.action).toBe("BUY");
      expect(order.status).toBe("pending");
      expect(order.notional).toBe(1000);
    });

    it("maps 'sell' side to SELL action", async () => {
      mockCreateOrder.mockResolvedValueOnce(makeSdkOrder({ side: "sell" }));

      const order = await adapter.submitOrder({
        ticker: "AAPL",
        action: "SELL",
        notional: 500,
      });

      expect(order.action).toBe("SELL");
    });

    it("wraps SDK errors in BrokerError", async () => {
      mockCreateOrder.mockRejectedValueOnce(new Error("Insufficient funds"));

      await expect(
        adapter.submitOrder({ ticker: "AAPL", action: "BUY", notional: 1000 }),
      ).rejects.toThrow(BrokerError);
    });

    it("BrokerError message includes ticker context", async () => {
      mockCreateOrder.mockRejectedValueOnce(new Error("rate limited"));

      try {
        await adapter.submitOrder({ ticker: "TSLA", action: "BUY", notional: 100 });
        fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(BrokerError);
        expect((err as BrokerError).message).toContain("TSLA");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getPositions
  // ---------------------------------------------------------------------------
  describe("getPositions", () => {
    it("returns normalised Position array", async () => {
      mockGetPositions.mockResolvedValueOnce([makeSdkPosition()]);

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(1);
      expect(positions[0]).toEqual({
        ticker: "AAPL",
        qty: 10,
        avgCost: 150,
        currentPrice: 160,
        marketValue: 1600,
        unrealizedPl: 100,
      });
    });

    it("returns empty array when no positions", async () => {
      mockGetPositions.mockResolvedValueOnce([]);
      const positions = await adapter.getPositions();
      expect(positions).toEqual([]);
    });

    it("wraps SDK errors in BrokerError", async () => {
      mockGetPositions.mockRejectedValueOnce(new Error("network timeout"));
      await expect(adapter.getPositions()).rejects.toThrow(BrokerError);
    });
  });

  // ---------------------------------------------------------------------------
  // getAccount
  // ---------------------------------------------------------------------------
  describe("getAccount", () => {
    it("returns normalised Account", async () => {
      mockGetAccount.mockResolvedValueOnce(makeSdkAccount());

      const account = await adapter.getAccount();

      expect(account).toEqual({
        equity: 100_000,
        cash: 50_000,
        buyingPower: 200_000,
        portfolioValue: 100_000,
      });
    });

    it("wraps SDK errors in BrokerError", async () => {
      mockGetAccount.mockRejectedValueOnce(new Error("unauthorised"));
      await expect(adapter.getAccount()).rejects.toThrow(BrokerError);
    });
  });

  // ---------------------------------------------------------------------------
  // cancelOrder
  // ---------------------------------------------------------------------------
  describe("cancelOrder", () => {
    it("calls SDK cancelOrder with the correct orderId", async () => {
      mockCancelOrder.mockResolvedValueOnce(undefined);

      await adapter.cancelOrder("order-abc");

      expect(mockCancelOrder).toHaveBeenCalledWith("order-abc");
    });

    it("wraps SDK errors in BrokerError", async () => {
      mockCancelOrder.mockRejectedValueOnce(new Error("order not found"));
      await expect(adapter.cancelOrder("x")).rejects.toThrow(BrokerError);
    });
  });

  // ---------------------------------------------------------------------------
  // listOrders
  // ---------------------------------------------------------------------------
  describe("listOrders", () => {
    it("calls SDK getOrders with status=all when no filter", async () => {
      mockGetOrders.mockResolvedValueOnce([]);

      await adapter.listOrders();

      expect(mockGetOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: "all" }),
      );
    });

    it("returns normalised Order array", async () => {
      mockGetOrders.mockResolvedValueOnce([
        makeSdkOrder(),
        makeSdkOrder({ id: "sdk-order-456", symbol: "MSFT", side: "sell" }),
      ]);

      const orders = await adapter.listOrders();
      expect(orders).toHaveLength(2);
      expect(orders[0].ticker).toBe("AAPL");
      expect(orders[1].ticker).toBe("MSFT");
      expect(orders[1].action).toBe("SELL");
    });

    it("filters by ticker in-process", async () => {
      mockGetOrders.mockResolvedValueOnce([
        makeSdkOrder({ symbol: "AAPL" }),
        makeSdkOrder({ id: "2", symbol: "MSFT" }),
      ]);

      const orders = await adapter.listOrders({ ticker: "AAPL" });
      expect(orders).toHaveLength(1);
      expect(orders[0].ticker).toBe("AAPL");
    });

    it("wraps SDK errors in BrokerError", async () => {
      mockGetOrders.mockRejectedValueOnce(new Error("bad gateway"));
      await expect(adapter.listOrders()).rejects.toThrow(BrokerError);
    });
  });

  // ---------------------------------------------------------------------------
  // Status normalisation
  // ---------------------------------------------------------------------------
  describe("status normalisation", () => {
    const cases: Array<[string, string]> = [
      ["new", "pending"],
      ["accepted", "pending"],
      ["pending_new", "pending"],
      ["filled", "filled"],
      ["done_for_day", "filled"],
      ["canceled", "cancelled"],
      ["cancelled", "cancelled"],
      ["expired", "expired"],
      ["rejected", "rejected"],
      ["open", "open"],
      ["partially_filled", "open"],
    ];

    test.each(cases)("SDK status '%s' → Atlas status '%s'", async (sdkStatus, atlasStatus) => {
      mockGetOrders.mockResolvedValueOnce([makeSdkOrder({ status: sdkStatus })]);
      const [order] = await adapter.listOrders();
      expect(order.status).toBe(atlasStatus);
    });
  });
});
