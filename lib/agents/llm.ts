/**
 * LLM client factory — provider-agnostic, backward-compatible.
 *
 * Supported providers:
 *   gemini           — ChatGoogleGenerativeAI (default, live trading locked here)
 *   groq             — ChatGroq (fast inference, free tier)
 *   ollama           — ChatOllama (local, no API key)
 *   openai-compatible — ChatOpenAI with a custom baseURL
 *
 * Backward-compat: getLlm("quick") with no second arg returns Gemini client,
 * exactly as before.  All existing callers remain untouched.
 *
 * Provider packages are lazy-loaded (dynamic import) so they don't add
 * cold-start overhead when only Gemini is used.
 */

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

// ─── Public types ──────────────────────────────────────────────────────────────

export type LLMProvider = "gemini" | "groq" | "ollama" | "openai-compatible";

export type LlmMode = "quick" | "deep";

export type LLMConfig = {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
  /** Groq / OpenAI-compatible API key.  Ollama has none. */
  apiKey?: string;
};

// ─── Default models per provider × tier ───────────────────────────────────────

export const PROVIDER_DEFAULTS: Record<LLMProvider, Record<LlmMode, string>> = {
  gemini:             { quick: "gemini-2.5-flash", deep: "gemini-2.5-flash" },
  groq:               { quick: "llama-3.3-70b-versatile", deep: "llama-3.3-70b-versatile" },
  ollama:             { quick: "gemma3:12b", deep: "llama3.2:latest" },
  "openai-compatible": { quick: "", deep: "" },
};

// ─── Legacy env-var model resolver (unchanged) ────────────────────────────────

const GEMINI_ENV_DEFAULTS: Record<LlmMode, string> = {
  quick: "gemini-2.5-flash",
  deep:  "gemini-2.5-flash",
};

/**
 * Returns the Gemini model ID for the given mode, respecting env overrides.
 * Kept for backward compatibility with callers that use getModelId() directly.
 */
export function getModelId(mode: LlmMode = "quick"): string {
  const envKey = `LLM_${mode.toUpperCase()}_MODEL`;
  return process.env[envKey] ?? GEMINI_ENV_DEFAULTS[mode];
}

// ─── Provider-specific constructors (lazy) ────────────────────────────────────

async function buildGemini(mode: LlmMode, config?: LLMConfig): Promise<ChatGoogleGenerativeAI> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  }
  const model = config?.model ?? getModelId(mode);
  return new ChatGoogleGenerativeAI({ model, apiKey });
}

async function buildGroq(mode: LlmMode, config: LLMConfig): Promise<BaseChatModel> {
  const { ChatGroq } = await import("@langchain/groq");
  const apiKey = config.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Groq API key is required (pass via LLMConfig.apiKey or GROQ_API_KEY env var)");
  }
  const model = config.model || PROVIDER_DEFAULTS.groq[mode];
  return new ChatGroq({ model, apiKey }) as unknown as BaseChatModel;
}

async function buildOllama(mode: LlmMode, config: LLMConfig): Promise<BaseChatModel> {
  const { ChatOllama } = await import("@langchain/ollama");
  const model = config.model || PROVIDER_DEFAULTS.ollama[mode];
  const baseUrl = config.baseUrl ?? "http://localhost:11434";
  return new ChatOllama({ model, baseUrl }) as unknown as BaseChatModel;
}

async function buildOpenAICompatible(mode: LlmMode, config: LLMConfig): Promise<BaseChatModel> {
  const { ChatOpenAI } = await import("@langchain/openai");
  const apiKey = config.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? "ollama";
  if (!config.baseUrl) {
    throw new Error("LLMConfig.baseUrl is required for openai-compatible provider");
  }
  const model = config.model || PROVIDER_DEFAULTS["openai-compatible"][mode];
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: { baseURL: config.baseUrl },
  }) as unknown as BaseChatModel;
}

// ─── Public factory ────────────────────────────────────────────────────────────

/**
 * Returns a LangChain chat model for the given mode and optional config.
 *
 * Backward-compatible: getLlm("quick") still returns Gemini 2.5 Flash.
 *
 * @param mode   - "quick" (analysts) or "deep" (synthesis / portfolio)
 * @param config - Optional provider config.  Defaults to Gemini when absent.
 */
export async function getLlm(
  mode: LlmMode = "quick",
  config?: LLMConfig,
): Promise<BaseChatModel> {
  const provider = config?.provider ?? "gemini";

  switch (provider) {
    case "gemini":
      return buildGemini(mode, config);
    case "groq":
      return buildGroq(mode, config!);
    case "ollama":
      return buildOllama(mode, config!);
    case "openai-compatible":
      return buildOpenAICompatible(mode, config!);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${exhaustive}`);
    }
  }
}
