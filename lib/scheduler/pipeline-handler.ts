/**
 * Inngest function: on-pipeline-triggered
 *
 * Handles "app/pipeline.triggered" events emitted by the dispatcher.
 * Invokes the agent graph (runGraph) for the given user/ticker and, in
 * autonomous mode with low confidence, dispatches a notification event for
 * the notification service (sprint 013) to pick up.
 */

import { inngest } from "../inngest"
import { runGraph } from "../agents"
import type { RunGraphOptions } from "../agents"

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

    const result = await step.run("run-graph", async () => {
      return runGraph(ticker, {
        mode,
        philosophy,
        isBacktest: false,
        userId,
      } as RunGraphOptions)
    })

    const confidence = result.portfolio_decision?.confidence ?? 1

    // In autonomous mode with low confidence → notify the user.
    if (mode === "autonomous" && confidence < LOW_CONFIDENCE_THRESHOLD) {
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
