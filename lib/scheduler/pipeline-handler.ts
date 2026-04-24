/**
 * Inngest function: on-pipeline-triggered
 *
 * Handles "app/pipeline.triggered" events emitted by the dispatcher.
 * Invokes the agent graph (runGraph) for the given user/ticker and, in
 * autonomous mode with low confidence, dispatches a notification event for
 * the notification service (sprint 013) to pick up.
 */

import { inngest } from "../inngest"

// runGraph is provided by sprint 009 (frontend/lib/agents/index.ts).
// We import it dynamically so this file compiles even before 009 merges;
// once 009 lands the real implementation is used automatically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RunGraphOptions = {
  mode: "advisory" | "autonomous"
  philosophy: string
  isBacktest: boolean
  userId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GraphResult = {
  confidence: number
  [key: string]: unknown
}

async function resolveRunGraph(): Promise<(ticker: string, opts: RunGraphOptions) => Promise<GraphResult>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../agents/index")
    return mod.runGraph
  } catch {
    throw new Error(
      "[pipeline-handler] frontend/lib/agents/index.ts not found — ensure sprint 009 has been merged."
    )
  }
}

const LOW_CONFIDENCE_THRESHOLD = 0.65

export const onPipelineTriggered = inngest.createFunction(
  { id: "on-pipeline-triggered", triggers: [{ event: "app/pipeline.triggered" }] },
  async ({ event, step }: { event: { data: Record<string, unknown> }; step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const { userId, ticker, philosophy, mode, asOfDate } = event.data as {
      userId: string
      ticker: string
      philosophy: string
      mode: "advisory" | "autonomous"
      asOfDate: string
    }

    const result: GraphResult = await step.run("run-graph", async () => {
      const runGraph = await resolveRunGraph()
      return runGraph(ticker, {
        mode,
        philosophy,
        isBacktest: false,
        userId,
      })
    })

    // In autonomous mode with low confidence → notify the user.
    // The notification service (sprint 013) subscribes to "app/notification.requested".
    if (mode === "autonomous" && result.confidence < LOW_CONFIDENCE_THRESHOLD) {
      await step.run("notify-low-confidence", async () => {
        await inngest.send({
          name: "app/notification.requested",
          data: { userId, ticker, result },
        })
      })
    }

    return result
  }
)
