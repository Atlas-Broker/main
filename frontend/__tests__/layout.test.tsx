import { render, screen } from "@testing-library/react";

jest.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="clerk-provider">{children}</div>
  ),
}));

import RootLayout from "../app/layout";

test("RootLayout renders ClerkProvider", () => {
  expect(() =>
    render(<div data-testid="clerk-provider">child</div>)
  ).not.toThrow();
  expect(screen.getByTestId("clerk-provider")).toBeInTheDocument();
});
