/**
 * save_trace node — persists the full pipeline run to MongoDB.
 *
 * Mirrors backend/agents/graph.py::save_trace node.
 */

import type { AtlasState } from "../state";
import { saveTrace } from "../memory/trace";

export async function saveTraceNode(
  state: AtlasState,
): Promise<Partial<AtlasState>> {
  const outputs = state.analyst_outputs ?? {};

  const traceId = await saveTrace({
    ticker: state.ticker,
    userId: state.user_id,
    boundaryMode: state.boundary_mode,
    technical: outputs.technical ?? {},
    fundamental: outputs.fundamental ?? {},
    sentiment: outputs.sentiment ?? {},
    synthesis: state.synthesis ?? {},
    risk: state.risk ?? {},
    finalDecision: state.portfolio_decision ?? {},
  });

  return { trace_id: traceId };
}
