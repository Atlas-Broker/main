/**
 * Unit tests for the runBacktest Inngest function.
 *
 * Strategy:
 *  - generateDateRange: pure function, tested directly
 *  - runBacktest handler: mongodb is mocked; we verify the MongoDB
 *    replaceOne/updateOne calls to confirm upsert semantics, and verify
 *    the handler return value for metrics completeness.
 *
 * All external I/O (mongodb, agents, Inngest) is mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — jest.mock factories are hoisted before variable declarations.
// All state must be within factory closures or use jest.fn() captured after
// module load.
// ---------------------------------------------------------------------------

// Capture MongoDB operation mocks — accessed after module is loaded
const mockReplaceOne = jest.fn().mockResolvedValue({ acknowledged: true });
const mockUpdateOne = jest.fn().mockResolvedValue({ acknowledged: true });

jest.mock("mongodb", () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    db: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        replaceOne: (...args: unknown[]) => mockReplaceOne(...args),
        updateOne: (...args: unknown[]) => mockUpdateOne(...args),
      }),
    }),
  })),
}));

jest.mock("../../agents", () => ({
  runGraph: jest.fn().mockResolvedValue({
    portfolio_decision: { action: "buy", confidence: 0.8, reasoning: "test" },
  }),
}));

// Inngest mock — stores the handler on the returned function object.
// Uses only factory-local state (no outer variable access after hoisting).
jest.mock("inngest", () => ({
  Inngest: jest.fn().mockImplementation(() => ({
    createFunction: jest.fn(
      (
        _options: unknown,
        handler: (...a: unknown[]) => Promise<unknown>,
      ) => ({ __handler: handler }),
    ),
  })),
}));

// ---------------------------------------------------------------------------
// Set required environment variables before module load
// ---------------------------------------------------------------------------

process.env["MONGODB_URI"] = "mongodb://localhost:27017";

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { generateDateRange } from "../runner";

// ---------------------------------------------------------------------------
// generateDateRange — pure function
// ---------------------------------------------------------------------------

describe("generateDateRange", () => {
  it("excludes weekends", () => {
    const dates = generateDateRange("2023-01-02", "2023-01-08");
    expect(dates).toEqual([
      "2023-01-02",
      "2023-01-03",
      "2023-01-04",
      "2023-01-05",
      "2023-01-06",
    ]);
  });

  it("returns empty array when start > end", () => {
    expect(generateDateRange("2023-01-05", "2023-01-02")).toEqual([]);
  });

  it("returns single day when start === end on a weekday", () => {
    expect(generateDateRange("2023-01-04", "2023-01-04")).toEqual([
      "2023-01-04",
    ]);
  });

  it("returns empty array when start === end on a weekend", () => {
    expect(generateDateRange("2023-01-07", "2023-01-07")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runBacktest handler tests
// ---------------------------------------------------------------------------

type StepCtx = {
  event: {
    data: {
      userId: string;
      tickers: string[];
      startDate: string;
      endDate: string;
      philosophy: "buffett" | "soros" | "lynch" | "balanced";
      jobId: string;
    };
  };
  step: {
    run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
  };
};

type HandlerFn = (ctx: StepCtx) => Promise<{
  jobId: string;
  slices: number;
  metrics: Record<string, unknown>;
}>;

describe("runBacktest handler", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const agentsModule = require("../../agents") as { runGraph: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runBacktest } = require("../runner") as typeof import("../runner");

  function getHandler(): HandlerFn {
    return (runBacktest as unknown as { __handler: HandlerFn }).__handler;
  }

  function buildStep() {
    const stepIds: string[] = [];
    const step = {
      run: jest.fn(async (id: string, fn: () => Promise<unknown>): Promise<unknown> => {
        stepIds.push(id);
        return fn();
      }),
    } as unknown as StepCtx["step"];
    return { step, stepIds };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockReplaceOne.mockResolvedValue({ acknowledged: true });
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it("invokes step.run for every (date × ticker) combination", async () => {
    const { step, stepIds } = buildStep();
    const handler = getHandler();

    await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["AAPL", "MSFT"],
          startDate: "2023-01-02",
          endDate: "2023-01-04",
          philosophy: "balanced",
          jobId: "job_abc",
        },
      },
      step,
    });

    // 3 trading days × 2 tickers = 6 steps
    const expectedDates = ["2023-01-02", "2023-01-03", "2023-01-04"];
    const expectedTickers = ["AAPL", "MSFT"];
    expect(stepIds).toHaveLength(expectedDates.length * expectedTickers.length);
    for (const date of expectedDates) {
      for (const ticker of expectedTickers) {
        expect(stepIds).toContain(`slice-${date}-${ticker}`);
      }
    }
  });

  it("calls replaceOne with correct (jobId, date, ticker) filter key for every step", async () => {
    const { step } = buildStep();
    const handler = getHandler();

    await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["AAPL"],
          startDate: "2023-01-02",
          endDate: "2023-01-03",
          philosophy: "buffett",
          jobId: "job_xyz",
        },
      },
      step,
    });

    // replaceOne should be called once per (date × ticker) pair
    expect(mockReplaceOne).toHaveBeenCalledTimes(2);
    expect(mockReplaceOne).toHaveBeenCalledWith(
      { jobId: "job_xyz", date: "2023-01-02", ticker: "AAPL" },
      expect.objectContaining({ jobId: "job_xyz", date: "2023-01-02", ticker: "AAPL" }),
      { upsert: true },
    );
    expect(mockReplaceOne).toHaveBeenCalledWith(
      { jobId: "job_xyz", date: "2023-01-03", ticker: "AAPL" },
      expect.objectContaining({ jobId: "job_xyz", date: "2023-01-03", ticker: "AAPL" }),
      { upsert: true },
    );
  });

  it("calls updateOne (markJobComplete) after all slices are done", async () => {
    const { step } = buildStep();
    const handler = getHandler();

    await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["AAPL"],
          startDate: "2023-01-02",
          endDate: "2023-01-02",
          philosophy: "soros",
          jobId: "job_done",
        },
      },
      step,
    });

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockUpdateOne.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ jobId: "job_done" });
    const setOp = (update as { $set: Record<string, unknown> }).$set;
    expect(setOp).toHaveProperty("status", "completed");
    expect(setOp).toHaveProperty("metrics");
    expect(setOp["metrics"]).toHaveProperty("cagr");
    expect(setOp["metrics"]).toHaveProperty("sharpeRatio");
    expect(setOp["metrics"]).toHaveProperty("maxDrawdown");
  });

  it("returns correct slices count and metrics in the result", async () => {
    const { step } = buildStep();
    const handler = getHandler();

    const result = await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["AAPL", "GOOG"],
          startDate: "2023-01-02",
          endDate: "2023-01-03",
          philosophy: "lynch",
          jobId: "job_result",
        },
      },
      step,
    });

    // 2 days × 2 tickers = 4 slices
    expect(result.slices).toBe(4);
    expect(result.jobId).toBe("job_result");
    expect(result.metrics).toHaveProperty("cagr");
  });

  it("passes runGraph result as decision in each slice", async () => {
    const fakeDecision = { action: "sell", confidence: 0.9 };
    agentsModule.runGraph.mockResolvedValue(fakeDecision);

    const { step } = buildStep();
    const handler = getHandler();

    await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["GOOG"],
          startDate: "2023-01-02",
          endDate: "2023-01-02",
          philosophy: "lynch",
          jobId: "job_goog",
        },
      },
      step,
    });

    expect(mockReplaceOne).toHaveBeenCalledWith(
      { jobId: "job_goog", date: "2023-01-02", ticker: "GOOG" },
      expect.objectContaining({ decision: fakeDecision }),
      { upsert: true },
    );
  });

  it("does not write duplicate slices when a step re-runs (Inngest replay)", async () => {
    // Simulate Inngest replay: step.run returns a cached result on second
    // call with same id, without invoking fn. replaceOne should be called
    // exactly once per (date × ticker) — not twice.
    const executedIds = new Set<string>();
    const step = {
      run: jest.fn(async (id: string, fn: () => Promise<unknown>): Promise<unknown> => {
        if (executedIds.has(id)) {
          // Replay — return cached, fn NOT called
          return { jobId: "job_r", date: "2023-01-02", ticker: "AAPL", decision: {}, completedAt: "" };
        }
        executedIds.add(id);
        return fn();
      }),
    } as unknown as StepCtx["step"];

    const handler = getHandler();

    await handler({
      event: {
        data: {
          userId: "user_1",
          tickers: ["AAPL"],
          startDate: "2023-01-02",
          endDate: "2023-01-02",
          philosophy: "balanced",
          jobId: "job_r",
        },
      },
      step,
    });

    // fn ran once; replaceOne called exactly once (no duplicate)
    expect(mockReplaceOne).toHaveBeenCalledTimes(1);
  });
});
