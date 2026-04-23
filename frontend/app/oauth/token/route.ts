/**
 * OAuth 2.1 token endpoint.
 *
 * Accepts an authorization_code + PKCE code_verifier, verifies the code was
 * issued by /oauth/authorize and matches the PKCE challenge, then returns the
 * real `ATLAS_MCP_TOKEN` as the access_token.
 *
 * For a single-tenant setup this collapses the OAuth dance down to: "prove you
 * came from the same browser that started /authorize" (via PKCE), and you get
 * the shared PAT.
 */
import { NextRequest, NextResponse } from "next/server";
import { accessToken, verifyAuthorizationCode } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

function tokenError(code: string, description: string, status: number = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: CORS_HEADERS },
  );
}

async function parseForm(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  const fields: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === "string") fields[k] = v;
    }
    return fields;
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  for (const [k, v] of params.entries()) fields[k] = v;
  return fields;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const fields = await parseForm(req);
  const grantType = fields.grant_type;
  const code = fields.code;
  const codeVerifier = fields.code_verifier;
  const redirectUri = fields.redirect_uri;

  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type", "only authorization_code is supported");
  }
  if (!code) return tokenError("invalid_request", "code required");
  if (!codeVerifier) return tokenError("invalid_request", "code_verifier required (PKCE)");
  if (!redirectUri) return tokenError("invalid_request", "redirect_uri required");

  const verification = verifyAuthorizationCode(code, codeVerifier, redirectUri);
  if (!verification.ok) {
    return tokenError("invalid_grant", verification.error);
  }

  return NextResponse.json(
    {
      access_token: accessToken(),
      token_type: "Bearer",
      expires_in: 60 * 60 * 24 * 365, // 1 year — token is the static PAT, lifetime is "until rotated"
      scope: "mcp:docs",
    },
    { status: 200, headers: CORS_HEADERS },
  );
}
