/**
 * POST /api/v1/llm/preflight
 *
 * Validates that a given LLM config can produce structured output before
 * a backtest job is submitted.
 *
 * Request body: { provider, model, baseUrl?, apiKey? }
 * Response:     PreflightResult
 */

import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { checkModelCapability } from "@/lib/agents/llm-preflight";

const PreflightRequestSchema = z.object({
  provider: z.enum(["gemini", "groq", "ollama", "openai-compatible"]),
  model: z.string().min(1).max(128),
  baseUrl: z.string().url("baseUrl must be a valid URL").optional(),
  apiKey: z.string().max(512).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = PreflightRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { provider, model, baseUrl, apiKey } = parsed.data;

  const result = await checkModelCapability({ provider, model, baseUrl, apiKey });

  const status = result.ok ? 200 : 422;
  return Response.json(result, { status });
}
