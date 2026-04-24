/**
 * fetch_account node — fetches live account balance from the broker.
 *
 * Mirrors backend/agents/graph.py::fetch_account node.
 * In backtest mode or when account_info is pre-seeded, this node is a no-op.
 */

import type { AtlasState, AccountInfo } from "../state";
import { AlpacaAdapter } from "@/lib/broker";

function isBacktest(state: AtlasState): boolean {
  return state.as_of_date != null;
}

export async function fetchAccountNode(
  state: AtlasState,
): Promise<Partial<AtlasState>> {
  // In backtest mode or when pre-seeded, skip the live broker fetch
  if (isBacktest(state) || state.account_info != null) {
    return {};
  }

  try {
    const broker = new AlpacaAdapter();
    const acct = await broker.getAccount();
    const accountInfo: AccountInfo = {
      portfolio_value: acct.portfolioValue,
      buying_power: acct.buyingPower,
      equity: acct.equity,
    };
    return { account_info: accountInfo };
  } catch {
    // Log context but don't expose internals
    return { account_info: null };
  }
}
