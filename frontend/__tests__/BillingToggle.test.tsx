import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    style,
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => <a href={href} style={style}>{children}</a>,
}));

import { BillingToggle } from "../app/pricing/BillingToggle";

describe("BillingToggle", () => {
  it("defaults to annual billing and shows annual prices", () => {
    render(<BillingToggle />);
    expect(screen.getByText("39")).toBeInTheDocument();
    expect(screen.getByText("119")).toBeInTheDocument();
    expect(screen.getByText("Save 20%")).toBeInTheDocument();
  });

  it("switches to monthly prices when Monthly is clicked", () => {
    render(<BillingToggle />);
    fireEvent.click(screen.getByText("Monthly"));
    expect(screen.getByText("49")).toBeInTheDocument();
    expect(screen.getByText("149")).toBeInTheDocument();
    expect(screen.queryByText("Save 20%")).not.toBeInTheDocument();
  });

  it("switches back to annual when Annual is clicked", () => {
    render(<BillingToggle />);
    fireEvent.click(screen.getByText("Monthly"));
    fireEvent.click(screen.getByText("Annual"));
    expect(screen.getByText("39")).toBeInTheDocument();
    expect(screen.getByText("Save 20%")).toBeInTheDocument();
  });

  it("all CTA buttons link to /login", () => {
    render(<BillingToggle />);
    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });
});
