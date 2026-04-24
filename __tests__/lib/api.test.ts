jest.mock("../../lib/auth", () => ({
  getClerkToken: jest.fn(),
}));

import { getClerkToken } from "../../lib/auth";
import { fetchWithAuth } from "../../lib/api";

const mockGetToken = getClerkToken as jest.MockedFunction<typeof getClerkToken>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe("fetchWithAuth", () => {
  it("returns null when token is null (session expired)", async () => {
    mockGetToken.mockResolvedValue(null);
    const result = await fetchWithAuth("http://localhost:8000/v1/portfolio");
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("attaches Bearer token to Authorization header", async () => {
    mockGetToken.mockResolvedValue("test-jwt-token");
    const mockResponse = { status: 200, ok: true } as Response;
    global.fetch = jest.fn().mockResolvedValue(mockResponse);
    const result = await fetchWithAuth("http://localhost:8000/v1/portfolio");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/v1/portfolio",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-jwt-token",
        }),
      })
    );
    expect(result).toBe(mockResponse);
  });

  it("returns null on 401 response", async () => {
    mockGetToken.mockResolvedValue("test-jwt-token");
    const mockResponse = { status: 401, ok: false } as Response;
    global.fetch = jest.fn().mockResolvedValue(mockResponse);
    const result = await fetchWithAuth("http://localhost:8000/v1/portfolio");
    expect(result).toBeNull();
  });

  it("passes through non-401 error responses (e.g. 500)", async () => {
    mockGetToken.mockResolvedValue("test-jwt-token");
    const mockResponse = { status: 500, ok: false } as Response;
    global.fetch = jest.fn().mockResolvedValue(mockResponse);
    const result = await fetchWithAuth("http://localhost:8000/v1/portfolio");
    expect(result).toBe(mockResponse);
  });

  it("merges caller-supplied headers with Authorization", async () => {
    mockGetToken.mockResolvedValue("test-jwt");
    const mockResponse = { status: 200, ok: true } as Response;
    global.fetch = jest.fn().mockResolvedValue(mockResponse);
    await fetchWithAuth("http://localhost:8000/v1/portfolio", {
      headers: { "Content-Type": "application/json" },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
      })
    );
  });
});
