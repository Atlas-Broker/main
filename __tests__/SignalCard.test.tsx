import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock @clerk/nextjs
jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: jest.fn() }),
  useUser: () => ({ isLoaded: true, user: { firstName: "Test", imageUrl: null } }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../lib/api", () => ({
  fetchWithAuth: jest.fn(),
}));

const mockSignal = {
  id: "sig-001",
  ticker: "TSLA",
  action: "BUY" as const,
  confidence: 0.85,
  reasoning: "Strong momentum",
  boundary_mode: "conditional",
  risk: { stop_loss: 240, take_profit: 270, position_size: 10, risk_reward_ratio: 2.0 },
  created_at: "2026-03-17T10:00:00",
};

describe("SignalCard reject button", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;
  });

  it("shows loading state while rejecting", async () => {
    // Make fetch hang (never resolves) so we can check loading state
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { SignalCard } = await import("../app/dashboard/DashboardClient");

    render(<SignalCard signal={mockSignal} />);

    const rejectBtn = screen.getByRole("button", { name: /✗|reject/i });
    fireEvent.click(rejectBtn);

    // Button should be disabled during loading
    await waitFor(() => {
      expect(rejectBtn).toBeDisabled();
    });
  });

  it("shows rejected state after successful rejection", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { SignalCard } = await import("../app/dashboard/DashboardClient");
    const onReject = jest.fn();

    render(<SignalCard signal={mockSignal} onReject={onReject} />);

    const rejectBtn = screen.getByRole("button", { name: /✗|reject/i });
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    await waitFor(() => {
      expect(onReject).toHaveBeenCalledWith("sig-001");
    });

    // Button should be disabled after rejection
    expect(rejectBtn).toBeDisabled();
  });

  it("calls onReject callback with signal id on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { SignalCard } = await import("../app/dashboard/DashboardClient");
    const onReject = jest.fn();

    render(<SignalCard signal={mockSignal} onReject={onReject} />);

    const rejectBtn = screen.getByRole("button", { name: /✗|reject/i });
    await act(async () => {
      fireEvent.click(rejectBtn);
    });

    await waitFor(() => expect(onReject).toHaveBeenCalledWith("sig-001"));
  });
});
