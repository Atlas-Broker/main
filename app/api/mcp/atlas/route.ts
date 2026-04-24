import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_INFO = { name: "atlas-api", version: "0.1.0" };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

type AuthContext = { pat_id: string; user_id: string; role: string; scope: string };

async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");

  const sb = getServiceClient();
  const { data: pat } = await sb
    .from("user_pats")
    .select("id, user_id, scope, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!pat) return null;
  if (pat.expires_at && new Date(pat.expires_at) < new Date()) return null;

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", pat.user_id)
    .maybeSingle();

  // Fire-and-forget last_used_at update — don't await to avoid adding latency
  sb.from("user_pats")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", pat.id)
    .then(() => {});

  return {
    pat_id: pat.id,
    user_id: pat.user_id,
    role: String(profile?.role ?? "user"),
    scope: pat.scope,
  };
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function dispatch(
  req: { jsonrpc: "2.0"; id?: JsonRpcId; method: string; params?: Record<string, unknown> },
  _ctx: AuthContext,
) {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Atlas API MCP — provides read/write access to your Atlas account. Tools coming in sprint 018.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "tools/list":
      return rpcResult(id, { tools: [] });
    case "ping":
      return rpcResult(id, {});
    default:
      return rpcError(id, -32601, `Method not found: ${req.method}`);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const BASE_URL = (
  process.env.NEXT_PUBLIC_MCP_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://atlas-broker-uat.vercel.app"
).replace(/\/$/, "");

const WWW_AUTHENTICATE = `Bearer realm="atlas-api-mcp", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`;

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if (!ctx) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } },
      { status: 401, headers: { "WWW-Authenticate": WWW_AUTHENTICATE } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 },
    );
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((m) => dispatch(m as Parameters<typeof dispatch>[0], ctx)),
    );
    return NextResponse.json(responses.filter((r) => r !== null));
  }

  const response = await dispatch(body as Parameters<typeof dispatch>[0], ctx);
  if (response === null) return new NextResponse(null, { status: 204 });
  return NextResponse.json(response);
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if (!ctx) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": WWW_AUTHENTICATE } },
    );
  }
  return NextResponse.json({
    server: SERVER_INFO,
    transport: "http",
    method: "POST application/json with JSON-RPC 2.0 body",
    tools: [],
    context: { scope: ctx.scope, role: ctx.role },
  });
}
