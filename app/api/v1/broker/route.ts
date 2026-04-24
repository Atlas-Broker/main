/**
 * GET    /api/v1/broker/connection — broker connection status (secret masked)
 * POST   /api/v1/broker/connection — save and verify Alpaca API key + secret
 * DELETE /api/v1/broker/connection — soft-delete (deactivate) the connection
 *
 * Port of backend/api/routes/broker.py.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";
import { AlpacaAdapter } from "@/lib/broker/alpaca";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const ConnectSchema = z.object({
  api_key: z.string().min(1),
  api_secret: z.string().min(1),
  environment: z.enum(["paper", "live"]).default("paper"),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function maskSecret(secret: string | null | undefined): string | null {
  if (!secret || secret.length < 4) return null;
  return `${"*".repeat(secret.length - 4)}${secret.slice(-4)}`;
}

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const url = new URL(req.url);
  const environment = url.searchParams.get("environment") ?? "paper";

  const { data } = await sb
    .from("broker_connections")
    .select("broker, auth_method, environment, api_key, api_secret, created_at, updated_at")
    .eq("user_id", user.userId)
    .eq("environment", environment)
    .eq("active", true)
    .maybeSingle();

  if (!data) return Response.json({ connected: false, broker: null });

  const row = data as Record<string, unknown>;
  return Response.json({
    connected: true,
    broker: row["broker"],
    auth_method: row["auth_method"],
    environment: row["environment"],
    api_key: row["api_key"],
    api_secret_masked: maskSecret(row["api_secret"] as string | undefined),
    created_at: row["created_at"],
    updated_at: row["updated_at"],
  });
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = ConnectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { api_key, api_secret, environment } = parsed.data;

  // Validate credentials before saving
  try {
    const adapter = new AlpacaAdapter(api_key, api_secret, environment === "paper");
    await adapter.getAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Alpaca credentials are invalid or unreachable: ${msg}` },
      { status: 400 },
    );
  }

  const sb = getServiceClient();
  await sb.from("broker_connections").upsert(
    {
      user_id: user.userId,
      broker: "alpaca",
      auth_method: "api_key",
      environment,
      api_key,
      api_secret,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,broker,environment" },
  );

  return Response.json({
    connected: true,
    broker: "alpaca",
    environment,
    message: "Alpaca connection saved and verified.",
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const environment = url.searchParams.get("environment") ?? "paper";

  const sb = getServiceClient();
  await sb
    .from("broker_connections")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.userId)
    .eq("environment", environment);

  return Response.json({ connected: false, message: "Broker connection deactivated." });
}
