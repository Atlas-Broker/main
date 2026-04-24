/**
 * OAuth 2.1 Dynamic Client Registration (RFC 7591).
 *
 * Atlas is single-tenant — we always hand back the same static client_id.
 * No client_secret (public client, PKCE only).
 */
import { NextRequest, NextResponse } from "next/server";
import { STATIC_CLIENT_ID } from "@/lib/mcp-oauth";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is allowed — Claude sometimes posts nothing.
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
  const clientName =
    typeof body.client_name === "string" ? body.client_name : "Atlas MCP Client";

  return NextResponse.json(
    {
      client_id: STATIC_CLIENT_ID,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      redirect_uris: redirectUris,
      client_name: clientName,
      scope: "mcp:docs",
    },
    { status: 201, headers: CORS_HEADERS },
  );
}
