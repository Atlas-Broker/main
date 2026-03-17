// frontend/__tests__/SettingsTab.test.tsx
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Mock fetchWithAuth (from lib/api)
jest.mock("../lib/api", () => ({
  fetchWithAuth: jest.fn(),
}));
import { fetchWithAuth } from "../lib/api";
const mockFetchWithAuth = fetchWithAuth as jest.MockedFunction<typeof fetchWithAuth>;

// Mock @clerk/nextjs (needed since dashboard/page.tsx uses auth hooks)
jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn() }),
  useUser: () => ({ isLoaded: true, user: { firstName: "Test", imageUrl: null } }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

// Mock next/router
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock ThemeProvider's useTheme hook
jest.mock("../app/components/ThemeProvider", () => ({
  useTheme: () => ({ dark: false, toggle: jest.fn() }),
}));

// Mock UserMenu component
jest.mock("../components/UserMenu", () => ({
  UserMenu: () => null,
}));

// Import SettingsTab (named export from dashboard/page.tsx)
import { SettingsTab } from "../app/dashboard/page";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

describe("SettingsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches profile on mount and sets boundary mode from API", async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      json: async () => ({ boundary_mode: "autonomous", display_name: "Alice" }),
      ok: true,
      status: 200,
    } as Response);

    await act(async () => {
      render(<SettingsTab />);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`);
    });

    const autonomousBtn = screen.getByRole("button", { name: /autonomous/i });
    expect(autonomousBtn).toHaveAttribute("data-selected", "true");
  });

  it("PATCHes profile when user selects a different mode", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce({
        json: async () => ({ boundary_mode: "advisory" }),
        ok: true,
        status: 200,
      } as Response)
      .mockResolvedValueOnce({ json: async () => ({}), ok: true, status: 200 } as Response);

    await act(async () => {
      render(<SettingsTab />);
    });

    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(1));

    const conditionalBtn = screen.getByRole("button", { name: /conditional/i });
    await act(async () => {
      fireEvent.click(conditionalBtn);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: "conditional" }),
      });
    });
  });

  it("defaults to conditional mode if API call fails", async () => {
    mockFetchWithAuth.mockRejectedValueOnce(new Error("Network error"));

    await act(async () => {
      render(<SettingsTab />);
    });

    const conditionalBtn = screen.getByRole("button", { name: /conditional/i });
    expect(conditionalBtn).toBeInTheDocument();
  });
});
