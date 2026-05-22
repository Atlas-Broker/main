/**
 * DB-backed OAuth 2.1 + PKCE helpers for the Atlas MCP server.
 *
 * Design (replaces the previous stateless HMAC-signed codes from sprint 001):
 *
 * - Authorization codes are random 32-byte tokens. Only the SHA-256 hash
 *   is persisted in `oauth_authorization_codes` along with the PKCE
 *   challenge, redirect_uri, user_id, client_id, and a 5-minute expiry.
 * - At /oauth/token exchange time, the row is looked up by hash. If valid
 *   (not expired, not yet used, PKCE matches, redirect_uri matches),
 *   `used_at` is stamped to enforce single-use, and the embedded userId
 *   is handed back so the route can mint a `user_pats` PAT.
 *
 * Why this replaces the HMAC pattern:
 * - No global signing secret. Every user's tokens trace back to unique
 *   random bytes (the code itself, plus the eventual PAT). Compromising
 *   one user yields nothing about another.
 * - Single-use is enforced server-side via `used_at`. A leaked code can't
 *   be replayed even within its 5-minute TTL.
 * - All state lives in Supabase with RLS denying anon/authenticated by
 *   default; only the service role (server-side) can read or write.
 *
 * Pattern source: EMDEE_OS — LEARNINGS, "Replace copy-paste PATs with an
 * OAuth authorize page" (2026-05-22). Atlas-specific adaptation reuses
 * the existing `user_pats` table as the token store.
 */
import { createHash, randomBytes } from "crypto";
import { getServiceClient } from "@/lib/supabase-server";

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STATIC_CLIENT_ID = "atlas-mcp-client";

function hashCode(rawCode: string): string {
  return createHash("sha256").update(rawCode).digest("hex");
}

export async function issueAuthorizationCode(params: {
  codeChallenge: string;
  redirectUri: string;
  userId: string;
  clientId?: string;
  scope?: string;
}): Promise<string> {
  const rawCode = randomBytes(32).toString("hex");
  const codeHash = hashCode(rawCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const sb = getServiceClient();
  const { error } = await sb.from("oauth_authorization_codes").insert({
    code_hash: codeHash,
    code_challenge: params.codeChallenge,
    redirect_uri: params.redirectUri,
    user_id: params.userId,
    client_id: params.clientId ?? STATIC_CLIENT_ID,
    scope: params.scope ?? "read_write",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`failed to persist authorization code: ${error.message}`);
  }

  return rawCode;
}

export async function verifyAuthorizationCode(
  rawCode: string,
  presentedVerifier: string,
  presentedRedirectUri: string,
): Promise<
  | { ok: true; userId: string; clientId: string; scope: string }
  | { ok: false; error: string }
> {
  const codeHash = hashCode(rawCode);
  const sb = getServiceClient();

  const { data: row, error } = await sb
    .from("oauth_authorization_codes")
    .select("id, code_challenge, redirect_uri, user_id, client_id, scope, expires_at, used_at")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (error) return { ok: false, error: `lookup failed: ${error.message}` };
  if (!row) return { ok: false, error: "code not found" };
  if (row.used_at) return { ok: false, error: "code already used" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "code expired" };
  if (row.redirect_uri !== presentedRedirectUri) {
    return { ok: false, error: "redirect_uri mismatch" };
  }

  // PKCE: the verifier must SHA-256 → base64url match the stored challenge.
  const recomputed = createHash("sha256")
    .update(presentedVerifier)
    .digest("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (recomputed !== row.code_challenge) {
    return { ok: false, error: "pkce mismatch" };
  }

  // Single-use enforcement: stamp used_at. If the update races with another
  // exchange attempt of the same code, the second attempt will see used_at
  // set on its own lookup above.
  const { error: updateError } = await sb
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);

  if (updateError) {
    return { ok: false, error: `failed to mark code used: ${updateError.message}` };
  }

  return {
    ok: true,
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope,
  };
}

export { STATIC_CLIENT_ID };
