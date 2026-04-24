/**
 * Gemini LLM client factory.
 *
 * Model selection is driven by environment variables — no code changes needed
 * when upgrading to a new model generation.
 *
 * To upgrade models, update these env vars:
 *   LLM_QUICK_MODEL=gemini-2.5-flash   fast — analysts, scanning
 *   LLM_DEEP_MODEL=gemini-2.5-pro      synthesis, final decisions
 *
 * Known Gemini model IDs:
 *   gemini-2.5-flash   balanced speed/quality (current default)
 *   gemini-2.5-pro     deepest reasoning
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

type LlmMode = "quick" | "deep";

const DEFAULTS: Record<LlmMode, string> = {
  quick: "gemini-2.5-flash",
  deep: "gemini-2.5-flash",
};

/**
 * Returns the model ID string for the given mode.
 * Reads from env vars: LLM_QUICK_MODEL, LLM_DEEP_MODEL.
 */
export function getModelId(mode: LlmMode = "quick"): string {
  const envKey = `LLM_${mode.toUpperCase()}_MODEL`;
  return process.env[envKey] ?? DEFAULTS[mode];
}

/**
 * Returns a ChatGoogleGenerativeAI instance configured for the given mode.
 *
 * Usage:
 *   const llm = getLlm("quick");
 *   const response = await llm.invoke(prompt);
 *
 * @throws {Error} if GOOGLE_GENERATIVE_AI_API_KEY is not set
 */
export function getLlm(mode: LlmMode = "quick"): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }
  return new ChatGoogleGenerativeAI({
    model: getModelId(mode),
    apiKey,
  });
}
