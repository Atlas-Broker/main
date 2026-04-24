/**
 * Tests for scheduler/crons.ts
 *
 * Verifies:
 *  - Each cron is registered with the correct schedule expression
 *  - Each cron calls dispatch() with the correct window name
 *  - Each cron returns a DispatchResult with window + triggered_count + duration_ms
 */

// ── dispatch mock ─────────────────────────────────────────────────────────────

const mockDispatch = jest.fn()

jest.mock("../dispatcher", () => ({
  dispatch: mockDispatch,
}))

// ── Inngest mock ──────────────────────────────────────────────────────────────

// Inngest v4: createFunction(options, handler) — 2 args.
// options.triggers[0].cron holds the cron expression.
interface CapturedFn {
  id: string
  /** First trigger object, e.g. { cron: "0 13 * * 1-5" } */
  trigger: { cron?: string; event?: string }
  handler: () => Promise<unknown>
}
const capturedFns: CapturedFn[] = []

jest.mock("../../inngest", () => ({
  inngest: {
    createFunction: jest.fn(
      (
        options: { id: string; triggers?: Array<{ cron?: string; event?: string }> },
        handler: () => Promise<unknown>
      ) => {
        const trigger = options.triggers?.[0] ?? {}
        capturedFns.push({ id: options.id, trigger, handler })
        return { id: options.id }
      }
    ),
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  premarketCron,
  openCron,
  midmorningCron,
  middayCron,
  afternoonCron,
  closeCron,
} from "../crons"

// ── Helpers ────────────────────────────────────────────────────────────────────

function findCaptured(id: string): CapturedFn {
  // capturedFns is populated on module load (import below triggers it)
  const fn = capturedFns.find((f) => f.id === id)
  if (!fn) throw new Error(`No cron captured with id "${id}". Captured: ${capturedFns.map((f) => f.id).join(", ")}`)
  return fn
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDispatch.mockResolvedValue({ triggered_count: 3 })
})

// ── Schedule expression tests ──────────────────────────────────────────────────

describe("cron schedule expressions (UTC)", () => {
  const cases: Array<{ exportedFn: unknown; id: string; cron: string }> = [
    { exportedFn: premarketCron,  id: "scheduler-premarket",  cron: "0 13 * * 1-5" },
    { exportedFn: openCron,       id: "scheduler-open",       cron: "30 13 * * 1-5" },
    { exportedFn: midmorningCron, id: "scheduler-midmorning", cron: "0 15 * * 1-5" },
    { exportedFn: middayCron,     id: "scheduler-midday",     cron: "0 17 * * 1-5" },
    { exportedFn: afternoonCron,  id: "scheduler-afternoon",  cron: "0 19 * * 1-5" },
    { exportedFn: closeCron,      id: "scheduler-close",      cron: "0 20 * * 1-5" },
  ]

  it.each(cases)('$id has cron "$cron"', ({ id, cron }) => {
    const captured = findCaptured(id)
    expect(captured.trigger.cron).toBe(cron)
  })
})

// ── Window name + dispatch call tests ─────────────────────────────────────────

describe("cron handlers call dispatch() with the correct window", () => {
  const cases: Array<{ id: string; window: string }> = [
    { id: "scheduler-premarket",  window: "premarket" },
    { id: "scheduler-open",       window: "open" },
    { id: "scheduler-midmorning", window: "midmorning" },
    { id: "scheduler-midday",     window: "midday" },
    { id: "scheduler-afternoon",  window: "afternoon" },
    { id: "scheduler-close",      window: "close" },
  ]

  it.each(cases)('$id dispatches window "$window"', async ({ id, window }) => {
    const captured = findCaptured(id)
    await captured.handler()
    expect(mockDispatch).toHaveBeenCalledWith(window)
  })
})

// ── Return value tests ────────────────────────────────────────────────────────

describe("cron handlers return a DispatchResult", () => {
  it("returns { window, triggered_count, duration_ms }", async () => {
    mockDispatch.mockResolvedValue({ triggered_count: 5 })
    const captured = findCaptured("scheduler-open")

    const result = await captured.handler() as { window: string; triggered_count: number; duration_ms: number }

    expect(result.window).toBe("open")
    expect(result.triggered_count).toBe(5)
    expect(typeof result.duration_ms).toBe("number")
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it("returns triggered_count=0 when no users are scheduled", async () => {
    mockDispatch.mockResolvedValue({ triggered_count: 0 })
    const captured = findCaptured("scheduler-premarket")

    const result = await captured.handler() as { triggered_count: number }
    expect(result.triggered_count).toBe(0)
  })
})

// ── Export smoke test ─────────────────────────────────────────────────────────

describe("exports", () => {
  it("exports all 6 cron function objects", () => {
    expect(premarketCron).toBeDefined()
    expect(openCron).toBeDefined()
    expect(midmorningCron).toBeDefined()
    expect(middayCron).toBeDefined()
    expect(afternoonCron).toBeDefined()
    expect(closeCron).toBeDefined()
  })
})
