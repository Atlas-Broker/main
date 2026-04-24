/**
 * Philosophy overlay tests.
 *
 * Verifies that overlay prepends correctly to prompts without corrupting
 * base prompt content, and that balanced mode returns no prefix.
 */

import {
  getPhilosophyPrefix,
  PHILOSOPHY_PROMPTS,
} from "../philosophies/index";

describe("getPhilosophyPrefix", () => {
  it("returns empty string for balanced mode", () => {
    expect(getPhilosophyPrefix("balanced")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(getPhilosophyPrefix(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(getPhilosophyPrefix(undefined)).toBe("");
  });

  it("returns a non-empty prefix for buffett", () => {
    const prefix = getPhilosophyPrefix("buffett");
    expect(prefix.length).toBeGreaterThan(0);
  });

  it("returns a non-empty prefix for soros", () => {
    const prefix = getPhilosophyPrefix("soros");
    expect(prefix.length).toBeGreaterThan(0);
  });

  it("returns a non-empty prefix for lynch", () => {
    const prefix = getPhilosophyPrefix("lynch");
    expect(prefix.length).toBeGreaterThan(0);
  });

  it("formats prefix with [Investment Philosophy: X] header", () => {
    const prefix = getPhilosophyPrefix("buffett");
    expect(prefix).toMatch(/^\[Investment Philosophy: Buffett\]/);
  });

  it("ends prefix with double newline to separate from base prompt", () => {
    const prefix = getPhilosophyPrefix("buffett");
    expect(prefix.endsWith("\n\n")).toBe(true);
  });

  it("prepends correctly without corrupting base prompt", () => {
    const basePrompt = "Analyse AAPL and return JSON.";
    const prefix = getPhilosophyPrefix("soros");
    const combined = prefix + basePrompt;
    expect(combined).toContain(basePrompt);
    expect(combined.indexOf(basePrompt)).toBe(prefix.length);
  });

  it("balanced prefix does not affect base prompt at all", () => {
    const basePrompt = "Analyse AAPL and return JSON.";
    const prefix = getPhilosophyPrefix("balanced");
    const combined = prefix + basePrompt;
    expect(combined).toBe(basePrompt);
  });
});

describe("PHILOSOPHY_PROMPTS content fidelity", () => {
  it("buffett prompt contains key concepts", () => {
    const prompt = PHILOSOPHY_PROMPTS["buffett"];
    expect(prompt).toContain("intrinsic value");
    expect(prompt).toContain("margin of safety");
    expect(prompt).toContain("moat");
  });

  it("soros prompt contains key concepts", () => {
    const prompt = PHILOSOPHY_PROMPTS["soros"];
    expect(prompt).toContain("reflexivity");
    expect(prompt).toContain("inflection");
  });

  it("lynch prompt contains key concepts", () => {
    const prompt = PHILOSOPHY_PROMPTS["lynch"];
    expect(prompt).toContain("GARP");
    expect(prompt).toContain("PEG");
  });

  it("balanced prompt is empty string", () => {
    expect(PHILOSOPHY_PROMPTS["balanced"]).toBe("");
  });
});
