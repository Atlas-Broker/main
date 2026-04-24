/**
 * Philosophy overlay factory.
 *
 * Mirrors backend/agents/philosophy.py exactly.
 *
 * Each philosophy mode prepends a context block to each analyst's prompt so
 * the LLM reasons within that framework. The LangGraph graph structure does
 * not change — overlays are prompt-level only.
 *
 * Modes:
 *   balanced  — Default. No overlay. Current behaviour unchanged.
 *   buffett   — Warren Buffett: intrinsic value, margin of safety, moat, long-term.
 *   soros     — George Soros: macro reflexivity, sentiment shifts, contrarian at inflections.
 *   lynch     — Peter Lynch: GARP (Growth At Reasonable Price), consumer-lens, identify trends early.
 */

import type { PhilosophyMode } from "../state";
import { BUFFETT_PROMPT } from "./buffett";
import { SOROS_PROMPT } from "./soros";
import { LYNCH_PROMPT } from "./lynch";
import { BALANCED_PROMPT } from "./balanced";

export const PHILOSOPHY_PROMPTS: Record<PhilosophyMode, string> = {
  buffett: BUFFETT_PROMPT,
  soros: SOROS_PROMPT,
  lynch: LYNCH_PROMPT,
  balanced: BALANCED_PROMPT,
};

export const VALID_PHILOSOPHY_MODES = new Set<PhilosophyMode>([
  "balanced",
  "buffett",
  "soros",
  "lynch",
]);

/**
 * Return a formatted prefix string to prepend to an analyst prompt.
 *
 * Returns an empty string for balanced mode or null/undefined (both mean no overlay).
 * Returns an empty string for any unrecognised mode (fail-safe).
 */
export function getPhilosophyPrefix(
  philosophyMode: PhilosophyMode | null | undefined,
): string {
  const mode = philosophyMode ?? "balanced";
  const prompt = PHILOSOPHY_PROMPTS[mode as PhilosophyMode] ?? "";
  if (!prompt) {
    return "";
  }
  const title = mode.charAt(0).toUpperCase() + mode.slice(1);
  return `[Investment Philosophy: ${title}]\n${prompt}\n\n`;
}
