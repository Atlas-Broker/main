/**
 * @jest-environment node
 *
 * Unit tests for lib/services/notifications.ts
 *
 * Mocks: Resend SDK, fetch (for Clerk API calls).
 */

// ─── Mock Resend ──────────────────────────────────────────────────────────────

const mockEmailsSend = jest.fn().mockResolvedValue({ id: "email_001" });

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClerkResponse(email: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      primary_email_address_id: "ea_1",
      email_addresses: [{ id: "ea_1", email_address: email }],
    }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("notifyLowConfidenceSignal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.CLERK_SECRET_KEY = "sk_test_clerk";
    process.env.RESEND_FROM_EMAIL = "noreply@atlas.test";
    process.env.NEXT_PUBLIC_APP_URL = "https://atlas.test/dashboard";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CLERK_SECRET_KEY;
  });

  it("sends an email with ticker and confidence in subject", async () => {
    mockFetch.mockResolvedValueOnce(makeClerkResponse("alice@test.com"));

    const { notifyLowConfidenceSignal } = await import(
      "@/lib/services/notifications"
    );
    await notifyLowConfidenceSignal("user_1", "AAPL", 0.45);

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const callArgs = mockEmailsSend.mock.calls[0][0] as {
      subject: string;
      to: string[];
      from: string;
      html: string;
    };
    expect(callArgs.subject).toContain("AAPL");
    expect(callArgs.subject).toContain("45%");
    expect(callArgs.to).toEqual(["alice@test.com"]);
    expect(callArgs.from).toBe("noreply@atlas.test");
  });

  it("does not throw when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;

    // Re-import to pick up env change — use jest.isolateModules for clean state
    await jest.isolateModulesAsync(async () => {
      const { notifyLowConfidenceSignal: fn } = await import(
        "@/lib/services/notifications"
      );
      await expect(fn("user_1", "AAPL", 0.4)).resolves.toBeUndefined();
    });

    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it("does not throw when Clerk returns non-200", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const { notifyLowConfidenceSignal } = await import(
      "@/lib/services/notifications"
    );
    await expect(
      notifyLowConfidenceSignal("user_1", "TSLA", 0.3)
    ).resolves.toBeUndefined();

    expect(mockEmailsSend).not.toHaveBeenCalled();
  });
});

describe("notifyBacktestComplete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.CLERK_SECRET_KEY = "sk_test_clerk";
    process.env.RESEND_FROM_EMAIL = "noreply@atlas.test";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.CLERK_SECRET_KEY;
  });

  it("sends a backtest complete email with metrics", async () => {
    mockFetch.mockResolvedValueOnce(makeClerkResponse("bob@test.com"));

    const { notifyBacktestComplete } = await import(
      "@/lib/services/notifications"
    );

    const metrics = {
      cagr: 0.12,
      sharpeRatio: 1.8,
      maxDrawdown: -0.15,
      calmarRatio: 0.8,
      profitFactor: 1.5,
      winRate: 0.6,
      totalTrades: 42,
      totalReturn: 0.25,
    };

    await notifyBacktestComplete("user_2", "job_abc", metrics);

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const callArgs = mockEmailsSend.mock.calls[0][0] as {
      subject: string;
      to: string[];
      html: string;
    };
    expect(callArgs.subject).toContain("job_abc");
    expect(callArgs.to).toEqual(["bob@test.com"]);
    expect(callArgs.html).toContain("25.00%"); // total return
    expect(callArgs.html).toContain("42"); // total trades
  });

  it("does not throw when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;

    await jest.isolateModulesAsync(async () => {
      const { notifyBacktestComplete: fn } = await import(
        "@/lib/services/notifications"
      );
      const metrics = {
        cagr: 0.1, sharpeRatio: 1, maxDrawdown: -0.1, calmarRatio: 1,
        profitFactor: 1.2, winRate: 0.5, totalTrades: 10, totalReturn: 0.1,
      };
      await expect(fn("user_2", "job_1", metrics)).resolves.toBeUndefined();
    });

    expect(mockEmailsSend).not.toHaveBeenCalled();
  });
});
