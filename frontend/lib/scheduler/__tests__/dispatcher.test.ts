/**
 * Tests for scheduler/dispatcher.ts
 *
 * Mocks:
 *   - @supabase/supabase-js  → fake createClient
 *   - ../inngest             → fake inngest.send
 */

import { dispatch, queryEnabledUsers, publishPipelineEvents } from "../dispatcher"

// ── Supabase mock ──────────────────────────────────────────────────────────────

const mockSelect = jest.fn()
const mockEq = jest.fn()
const mockFrom = jest.fn()

const buildChain = (data: unknown[] | null, error: { message: string } | null) => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  }
  // Last .eq() resolves the promise
  let callCount = 0
  chain.eq.mockImplementation(() => {
    callCount++
    if (callCount >= 2) {
      return Promise.resolve({ data, error })
    }
    return chain
  })
  return chain
}

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}))

// ── Inngest mock ───────────────────────────────────────────────────────────────

const mockSend = jest.fn()

jest.mock("../../inngest", () => ({
  inngest: {
    send: jest.fn(),
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js"
import { inngest } from "../../inngest"

const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>
const mockedSend = (inngest.send as jest.Mock)

function mockSupabaseRows(rows: unknown[]) {
  const chain = buildChain(rows, null)
  mockedCreateClient.mockReturnValue({
    from: jest.fn().mockReturnValue(chain),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

function mockSupabaseError(message: string) {
  const chain = buildChain(null, { message })
  mockedCreateClient.mockReturnValue({
    from: jest.fn().mockReturnValue(chain),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("dispatch()", () => {
  it("publishes one event per (user, ticker) pair and returns the correct count", async () => {
    const rows = [
      { user_id: "user_1", ticker: "AAPL", mode: "advisory", philosophy: "balanced" },
      { user_id: "user_1", ticker: "MSFT", mode: "advisory", philosophy: "balanced" },
      { user_id: "user_2", ticker: "NVDA", mode: "autonomous", philosophy: "buffett" },
    ]
    mockSupabaseRows(rows)
    mockedSend.mockResolvedValue(undefined)

    const result = await dispatch("premarket")

    expect(result.triggered_count).toBe(3)
    expect(mockedSend).toHaveBeenCalledTimes(1)

    const sentEvents = mockedSend.mock.calls[0][0]
    expect(sentEvents).toHaveLength(3)
    expect(sentEvents[0]).toMatchObject({
      name: "app/pipeline.triggered",
      data: expect.objectContaining({ userId: "user_1", ticker: "AAPL" }),
    })
    expect(sentEvents[2]).toMatchObject({
      name: "app/pipeline.triggered",
      data: expect.objectContaining({ userId: "user_2", ticker: "NVDA", mode: "autonomous" }),
    })
  })

  it("returns { triggered_count: 0 } and does not publish when no users are enabled", async () => {
    mockSupabaseRows([])
    mockedSend.mockResolvedValue(undefined)

    const result = await dispatch("midday")

    expect(result.triggered_count).toBe(0)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it("logs a warning and returns gracefully when Supabase returns an error", async () => {
    mockSupabaseError("connection refused")
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await dispatch("close")

    expect(result.triggered_count).toBe(0)
    expect(mockedSend).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("returns gracefully when inngest.send throws", async () => {
    const rows = [
      { user_id: "user_1", ticker: "AAPL", mode: "advisory", philosophy: "balanced" },
    ]
    mockSupabaseRows(rows)
    mockedSend.mockRejectedValue(new Error("inngest unavailable"))
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await dispatch("open")

    expect(result.triggered_count).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("queryEnabledUsers()", () => {
  it("returns only rows matching the given window", async () => {
    const rows = [
      { user_id: "user_1", ticker: "TSLA", mode: "advisory", philosophy: "soros" },
    ]
    mockSupabaseRows(rows)

    const result = await queryEnabledUsers("afternoon")

    expect(result).toHaveLength(1)
    expect(result[0].ticker).toBe("TSLA")
  })

  it("returns empty array when Supabase errors out", async () => {
    mockSupabaseError("timeout")
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await queryEnabledUsers("open")

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("publishPipelineEvents()", () => {
  it("does not call inngest.send when rows is empty", async () => {
    mockedSend.mockResolvedValue(undefined)

    await publishPipelineEvents("premarket", [])

    expect(mockedSend).not.toHaveBeenCalled()
  })

  it("sends correctly shaped events for each row", async () => {
    mockedSend.mockResolvedValue(undefined)
    const rows = [
      { user_id: "user_A", ticker: "META", mode: "autonomous" as const, philosophy: "lynch" },
    ]

    await publishPipelineEvents("close", rows)

    expect(mockedSend).toHaveBeenCalledTimes(1)
    const [events] = mockedSend.mock.calls[0]
    expect(events[0]).toMatchObject({
      name: "app/pipeline.triggered",
      data: {
        userId: "user_A",
        ticker: "META",
        mode: "autonomous",
        philosophy: "lynch",
      },
    })
    expect(typeof events[0].data.asOfDate).toBe("string")
  })
})
