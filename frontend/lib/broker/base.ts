/**
 * BrokerAdapter — the interface all broker implementations must satisfy.
 *
 * Never call broker APIs directly from application code.
 * Always go through this interface.
 *
 * IBKR future-readiness: to add IBKR support, create
 *   `ibkr.ts` exporting `class IbkrAdapter implements BrokerAdapter { … }`
 * — the interface is the only contract needed; no other files need changes.
 */

import type { Account, Order, OrderFilter, OrderRequest, Position } from "./types";

/**
 * Raised when a broker API call fails.
 *
 * Callers should catch `BrokerError` rather than raw SDK errors.
 * The `cause` field carries the original error for diagnostics.
 */
export class BrokerError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

/**
 * The contract every broker adapter must implement.
 *
 * All methods are async and return Atlas domain types.
 */
export interface BrokerAdapter {
  /**
   * Place a market order.
   *
   * @throws {BrokerError} if the order cannot be submitted.
   */
  submitOrder(order: OrderRequest): Promise<Order>;

  /**
   * Return all open positions for the account.
   *
   * @throws {BrokerError} on API failure.
   */
  getPositions(): Promise<Position[]>;

  /**
   * Return account equity, cash, and buying power.
   *
   * @throws {BrokerError} on API failure.
   */
  getAccount(): Promise<Account>;

  /**
   * Cancel an open order by ID.
   *
   * @throws {BrokerError} if the order cannot be cancelled.
   */
  cancelOrder(orderId: string): Promise<void>;

  /**
   * List orders, optionally filtered.
   *
   * @param filter - optional ticker / status filter
   * @throws {BrokerError} on API failure.
   */
  listOrders(filter?: OrderFilter): Promise<Order[]>;
}
