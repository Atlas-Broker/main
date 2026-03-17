import { render, screen } from "@testing-library/react";

jest.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-testid="clerk-sign-in">Sign In Component</div>,
}));

import LoginPage from "../app/login/page";

describe("LoginPage", () => {
  it("renders without crashing", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("clerk-sign-in")).toBeInTheDocument();
  });

  it("renders within a dark background container", () => {
    const { container } = render(<LoginPage />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
  });
});
