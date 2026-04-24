/**
 * @jest-environment node
 *
 * Unit tests for lib/auth/context.ts — getUserFromRequest()
 */
import { getUserFromRequest } from "@/lib/auth/context";

// The jest.config.ts already maps @clerk/nextjs/server → __mocks__/@clerk/nextjs/server.ts
// We cast the mock so we can configure return values.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { auth } = require("@clerk/nextjs/server") as {
  auth: jest.Mock;
};

const makeReq = () => new Request("http://localhost/api/v1/test");

describe("getUserFromRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when auth() has no userId", async () => {
    auth.mockResolvedValueOnce({ userId: null });

    const result = await getUserFromRequest(makeReq());

    expect(result).toBeNull();
  });

  it("returns null when auth() returns undefined userId", async () => {
    auth.mockResolvedValueOnce({ userId: undefined });

    const result = await getUserFromRequest(makeReq());

    expect(result).toBeNull();
  });

  it("returns { userId } when auth() has a valid userId", async () => {
    auth.mockResolvedValueOnce({ userId: "user_abc123" });

    const result = await getUserFromRequest(makeReq());

    expect(result).toEqual({ userId: "user_abc123" });
  });

  it("works without a request argument", async () => {
    auth.mockResolvedValueOnce({ userId: "user_xyz" });

    const result = await getUserFromRequest();

    expect(result).toEqual({ userId: "user_xyz" });
  });
});
