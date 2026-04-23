/**
 * Six Inngest cron functions — one per ET trading session window.
 *
 * All schedules are expressed in UTC (Mon–Fri, 1-5).
 * Each cron calls dispatch() and returns a DispatchResult summary.
 *
 * UTC schedule → ET time mapping:
 *   premarket:   "0 13 * * 1-5"  →  09:00 ET
 *   open:        "30 13 * * 1-5" →  09:30 ET
 *   midmorning:  "0 15 * * 1-5"  →  11:00 ET
 *   midday:      "0 17 * * 1-5"  →  13:00 ET
 *   afternoon:   "0 19 * * 1-5"  →  15:00 ET
 *   close:       "0 20 * * 1-5"  →  16:00 ET
 */

import { inngest } from "../inngest"
import { dispatch } from "./dispatcher"
import type { ScheduleWindow, DispatchResult } from "./types"

function makeCron(
  id: string,
  window: ScheduleWindow,
  cronExpr: string
) {
  return inngest.createFunction(
    { id, triggers: [{ cron: cronExpr }] },
    async (): Promise<DispatchResult> => {
      const start = Date.now()
      const { triggered_count } = await dispatch(window)
      return {
        window,
        triggered_count,
        duration_ms: Date.now() - start,
      }
    }
  )
}

export const premarketCron = makeCron(
  "scheduler-premarket",
  "premarket",
  "0 13 * * 1-5"
)

export const openCron = makeCron(
  "scheduler-open",
  "open",
  "30 13 * * 1-5"
)

export const midmorningCron = makeCron(
  "scheduler-midmorning",
  "midmorning",
  "0 15 * * 1-5"
)

export const middayCron = makeCron(
  "scheduler-midday",
  "midday",
  "0 17 * * 1-5"
)

export const afternoonCron = makeCron(
  "scheduler-afternoon",
  "afternoon",
  "0 19 * * 1-5"
)

export const closeCron = makeCron(
  "scheduler-close",
  "close",
  "0 20 * * 1-5"
)
