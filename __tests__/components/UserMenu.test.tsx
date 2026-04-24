const mockSignOut = jest.fn();
jest.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      firstName: "Jane",
      lastName: "Doe",
      imageUrl: "https://example.com/avatar.jpg",
      primaryEmailAddress: { emailAddress: "jane@example.com" },
    },
  }),
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

import { render, screen, fireEvent } from "@testing-library/react";
import { UserMenu } from "../../components/UserMenu";

describe("UserMenu", () => {
  beforeEach(() => jest.clearAllMocks());

  it("displays the user's full name", () => {
    render(<UserMenu />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders an avatar image", () => {
    render(<UserMenu />);
    const img = screen.getByRole("img", { name: /jane doe/i });
    expect(img).toHaveAttribute("src", expect.stringContaining("example.com"));
  });

  it("calls signOut when Sign Out button is clicked", () => {
    render(<UserMenu />);
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    fireEvent.click(signOutBtn);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
