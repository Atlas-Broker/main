jest.mock("../lib/api", () => ({
  fetchWithAuth: jest.fn().mockResolvedValue(null),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: jest.fn() }),
}));

import { render, waitFor } from "@testing-library/react";
import UserDashboard from "../app/dashboard/page";

describe("UserDashboard authentication", () => {
  beforeEach(() => jest.clearAllMocks());

  it("redirects to /login when fetchWithAuth returns null", async () => {
    render(<UserDashboard />);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });
});
