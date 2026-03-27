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

// Reusable response stubs
const profileResponse = (overrides: object = {}) =>
  ({
    json: async () => ({ boundary_mode: "advisory", ...overrides }),
    ok: true,
    status: 200,
  } as Response);

const brokerNotConnected = {
  json: async () => ({
    connected: false,
    broker: null,
    environment: null,
    api_key: null,
    api_secret_masked: null,
  }),
  ok: true,
  status: 200,
} as Response;

const okResponse = {
  json: async () => ({}),
  ok: true,
  status: 200,
} as Response;

// SettingsTab renders sub-components that fire fetchWithAuth on mount:
//   1. GET /v1/profile (boundary mode hydration — within SettingsTab itself)
//   2. GET /v1/broker/connection (AlpacaConnectionSection)
// Each test queues mocks for both initial calls before interacting.

// Helper: find a mode/philosophy card button by its visible label text
function getCardButton(labelText: string | RegExp) {
  return screen
    .getAllByRole("button")
    .find((btn) => btn.textContent?.match(labelText));
}

describe("SettingsTab — boundary mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue(brokerNotConnected);
  });

  it("fetches profile on mount and sets boundary mode from API", async () => {
    // AlpacaConnectionSection's effect fires before SettingsTab's effect (child-first order)
    mockFetchWithAuth
      .mockResolvedValueOnce(brokerNotConnected)
      .mockResolvedValueOnce(profileResponse({ boundary_mode: "autonomous" }));

    await act(async () => {
      render(<SettingsTab tier="pro" />);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`);
    });

    // Wait for the state update triggered by the profile fetch to propagate.
    // Use the description text unique to the standalone "Autonomous" card.
    await waitFor(() => {
      const autonomousOnlyBtn = getCardButton(/5-minute override window/);
      expect(autonomousOnlyBtn).toBeDefined();
      expect(autonomousOnlyBtn).toHaveAttribute("data-selected", "true");
    });
  });

  it("PATCHes profile when user selects a different boundary mode", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse({ boundary_mode: "advisory" }))
      .mockResolvedValueOnce(brokerNotConnected)
      .mockResolvedValueOnce(okResponse); // PATCH response

    await act(async () => {
      render(<SettingsTab tier="pro" />);
    });

    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(2));

    const guardrailBtn = getCardButton(/Autonomous \+ Guardrail/);
    expect(guardrailBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(guardrailBtn!);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_mode: "autonomous_guardrail" }),
      });
    });
  });

  it("defaults to advisory mode if profile API call fails", async () => {
    mockFetchWithAuth
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(brokerNotConnected);

    await act(async () => {
      render(<SettingsTab tier="pro" />);
    });

    const advisoryBtn = getCardButton(/^Advisory/);
    expect(advisoryBtn).toBeDefined();
    expect(advisoryBtn).toHaveAttribute("data-selected", "true");
  });
});

describe("SettingsTab — investment philosophy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue(brokerNotConnected);
  });

  it("initialises philosophy from the initialPhilosophy prop, not localStorage", async () => {
    // Set a conflicting value in localStorage to confirm it is not consulted
    localStorage.setItem("atlas_philosophy_mode", "soros");

    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())
      .mockResolvedValueOnce(brokerNotConnected);

    await act(async () => {
      render(<SettingsTab tier="pro" initialPhilosophy="buffett" />);
    });

    const buffettBtn = getCardButton(/^Buffett/);
    expect(buffettBtn).toBeDefined();
    expect(buffettBtn).toHaveAttribute("data-selected", "true");

    const sorosBtn = getCardButton(/^Soros/);
    expect(sorosBtn).toBeDefined();
    expect(sorosBtn).toHaveAttribute("data-selected", "false");

    localStorage.removeItem("atlas_philosophy_mode");
  });

  it("defaults philosophy to balanced when no initialPhilosophy prop is provided", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())
      .mockResolvedValueOnce(brokerNotConnected);

    await act(async () => {
      render(<SettingsTab tier="pro" />);
    });

    const balancedBtn = getCardButton(/^Balanced/);
    expect(balancedBtn).toBeDefined();
    expect(balancedBtn).toHaveAttribute("data-selected", "true");
  });

  it("PATCHes /v1/profile with investment_philosophy when a card is clicked", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())      // boundary_mode fetch
      .mockResolvedValueOnce(brokerNotConnected)     // AlpacaConnectionSection fetch
      .mockResolvedValueOnce(okResponse);            // philosophy PATCH

    await act(async () => {
      render(<SettingsTab tier="pro" initialPhilosophy="balanced" />);
    });

    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(2));

    const lynchBtn = getCardButton(/^Lynch/);
    expect(lynchBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(lynchBtn!);
    });

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(`${API_URL}/v1/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investment_philosophy: "lynch" }),
      });
    });

    // UI state should reflect the new selection immediately (optimistic update)
    expect(lynchBtn).toHaveAttribute("data-selected", "true");
  });

  it("does not crash and keeps UI update when philosophy PATCH fails", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())      // boundary_mode fetch
      .mockResolvedValueOnce(brokerNotConnected)     // AlpacaConnectionSection fetch
      .mockRejectedValueOnce(new Error("Network error")); // PATCH fails

    await act(async () => {
      render(<SettingsTab tier="pro" initialPhilosophy="balanced" />);
    });

    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(2));

    const sorosBtn = getCardButton(/^Soros/);
    expect(sorosBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(sorosBtn!);
    });

    // Component should still render and show the optimistic selection
    await waitFor(() => {
      expect(sorosBtn).toHaveAttribute("data-selected", "true");
    });

    // Error was logged, not swallowed silently
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to save investment philosophy:",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("calls onPhilosophyChange callback when a philosophy card is clicked", async () => {
    const onPhilosophyChange = jest.fn();

    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())
      .mockResolvedValueOnce(brokerNotConnected)
      .mockResolvedValueOnce(okResponse); // PATCH

    await act(async () => {
      render(
        <SettingsTab
          tier="pro"
          initialPhilosophy="balanced"
          onPhilosophyChange={onPhilosophyChange}
        />
      );
    });

    await waitFor(() => expect(mockFetchWithAuth).toHaveBeenCalledTimes(2));

    const buffettBtn = getCardButton(/^Buffett/);
    expect(buffettBtn).toBeDefined();
    await act(async () => {
      fireEvent.click(buffettBtn!);
    });

    expect(onPhilosophyChange).toHaveBeenCalledWith("buffett");
  });

  it("does not render philosophy cards for free tier users", async () => {
    mockFetchWithAuth
      .mockResolvedValueOnce(profileResponse())
      .mockResolvedValueOnce(brokerNotConnected);

    await act(async () => {
      render(<SettingsTab tier="free" />);
    });

    expect(getCardButton(/^Buffett/)).toBeUndefined();
    expect(getCardButton(/^Soros/)).toBeUndefined();
    expect(
      screen.getByText(/upgrade to pro or max to select an investment philosophy/i)
    ).toBeInTheDocument();
  });
});
