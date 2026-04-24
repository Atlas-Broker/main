/**
 * OAuth 2.1 authorization endpoint.
 *
 * Single-tenant, auto-approves. Validates required PKCE params, signs a code
 * carrying the challenge + redirect_uri + expiry, then 302s back to the client.
 *
 * No login screen, no consent UI — Edmund is the only user and the real auth
 * is the `ATLAS_MCP_TOKEN` env var. Anyone hitting this endpoint who doesn't
 * have the matching code_verifier can't exchange the code at /oauth/token.
 */
import { NextRequest, NextResponse } from "next/server";
import { issueAuthorizationCode } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(msg: string) {
  return NextResponse.json({ error: "invalid_request", error_description: msg }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;
  const responseType = params.get("response_type");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  if (responseType !== "code") return badRequest("response_type must be 'code'");
  if (!redirectUri) return badRequest("redirect_uri required");
  if (!codeChallenge) return badRequest("code_challenge required (PKCE)");
  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return badRequest("code_challenge_method must be S256");
  }

  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return badRequest("invalid redirect_uri");
  }

  const code = issueAuthorizationCode({ codeChallenge, redirectUri });
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), { status: 302 });
}
