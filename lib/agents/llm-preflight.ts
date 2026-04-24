/**
 * LLM preflight check — fires a minimal structured-output probe before a
 * backtest loop starts to verify the model can produce parseable JSON.
 *
 * A timeout of 10 s is enforced.  On success the latency is returned so the
 * UI can display it.
 */

import type { LLMConfig } from "./llm";
import { getLlm } from "./llm";

export type { LLMConfig } from "./llm";

export type PreflightResult = {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  error?: string;
};

const PROBE_PROMPT = `Return ONLY valid JSON with this exact structure, no commentary:
{"signal": "hold"}`;

const TIMEOUT_MS = 10_000;

/**
 * Check that the model is reachable and can produce structured output.
 * Returns { ok: true, latency_ms } on success or { ok: false, error } on failure.
 */
export async function checkModelCapability(config: LLMConfig): Promise<PreflightResult> {
  const startMs = Date.now();
  const base: Omit<PreflightResult, "ok" | "error"> = {
    provider: config.provider,
    model: config.model,
    latency_ms: 0,
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS),
  );

  try {
    const llm = await getLlm("quick", config);

    const invokePromise = llm.invoke(PROBE_PROMPT);
    const response = await Promise.race([invokePromise, timeoutPromise]);

    const raw = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean) as Record<string, unknown>;

    const signal = String(parsed["signal"] ?? "").toLowerCase();
    if (!["buy", "sell", "hold"].includes(signal)) {
      return {
        ...base,
        ok: false,
        latency_ms: Date.now() - startMs,
        error: `Unexpected signal value: "${signal}"`,
      };
    }

    return {
      ...base,
      ok: true,
      latency_ms: Date.now() - startMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ...base,
      ok: false,
      latency_ms: Date.now() - startMs,
      error: message,
    };
  }
}
