import React from "react";
import { render, screen } from "@testing-library/react";

// BillingToggle uses useState — mock it to keep this server component test simple
jest.mock("../app/pricing/BillingToggle", () => ({
  BillingToggle: () => <div data-testid="billing-toggle" />,
}));

import PricingPage from "../app/pricing/page";

describe("PricingPage", () => {
  it("renders the hero headline", () => {
    render(<PricingPage />);
    expect(screen.getByText("Invest with intelligence")).toBeInTheDocument();
  });

  it("renders the BillingToggle island", () => {
    render(<PricingPage />);
    expect(screen.getByTestId("billing-toggle")).toBeInTheDocument();
  });

  it("renders all four feature section headers", () => {
    render(<PricingPage />);
    expect(screen.getByText("Signal Engine")).toBeInTheDocument();
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Broker & Integrations")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });

  it("renders key feature rows", () => {
    render(<PricingPage />);
    expect(screen.getByText("Autonomous trading")).toBeInTheDocument();
    expect(screen.getByText("Backtesting engine")).toBeInTheDocument();
    expect(screen.getByText("Interactive Brokers (IBKR)")).toBeInTheDocument();
  });
});
