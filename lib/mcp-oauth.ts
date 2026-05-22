/**
 * Stateless OAuth 2.1 + PKCE helpers for the Atlas MCP server.
 *
 * Design:
 * - The "authorization code" is a signed payload carrying the code_challenge,
 *   redirect_uri, expiry, and the Clerk userId who clicked Approve on
 *   /oauth/authorize. HMAC-SHA256 with ATLAS_MCP_TOKEN as the signing key,
 *   so an attacker can't forge codes without that key.
 * - On code exchange, /oauth/token decodes the uid, mints a fresh
 *   user_pats row tied to that user, and returns the raw PAT as the
 *   access_token. The PAT (not the static signing key) is what reaches
 *   /api/mcp going forward; tools scope to user_id via getUserFromRequest.
 * - DCR returns a static public client; no client secrets.
 *
 * Replaces the prior single-tenant flow where /oauth/token returned the
 * shared ATLAS_MCP_TOKEN directly — see EMDEE_OS — LEARNINGS,
 * "Replace copy-paste PATs with an OAuth authorize page" (2026-05-22).
 *
 * This file is OK to import heavy-ish deps (Node crypto is built-in; fine).
 * It is NEVER imported by the discovery module — that stays dep-less.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STATIC_CLIENT_ID = "atlas-mcp-client";

function signingKey(): Buffer {
  const token = process.env.ATLAS_MCP_TOKEN;
  if (!token) throw new Error("ATLAS_MCP_TOKEN is not configured");
  return Buffer.from(token, "utf8");
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function pkceChallengeFromVerifier(verifier: string): string {
  return b64urlEncode(createHash("sha256").update(verifier).digest());
}

interface CodePayload {
  cc: string; // code_challenge
  ru: string; // redirect_uri
  uid: string; // Clerk user id who clicked Approve
  exp: number; // ms
}

export function issueAuthorizationCode(params: {
  codeChallenge: string;
  redirectUri: string;
  userId: string;
}): string {
  const payload: CodePayload = {
    cc: params.codeChallenge,
    ru: params.redirectUri,
    uid: params.userId,
    exp: Date.now() + CODE_TTL_MS,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(createHmac("sha256", signingKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyAuthorizationCode(
  code: string,
  presentedVerifier: string,
  presentedRedirectUri: string,
):
  | { ok: true; userId: string }
  | { ok: false; error: string } {
  const parts = code.split(".");
  if (parts.length !== 2) return { ok: false, error: "malformed code" };
  const [body, sig] = parts;

  const expectedSig = b64urlEncode(createHmac("sha256", signingKey()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "bad signature" };
  }

  let payload: CodePayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, error: "bad payload" };
  }

  if (Date.now() > payload.exp) return { ok: false, error: "code expired" };
  if (payload.ru !== presentedRedirectUri) return { ok: false, error: "redirect_uri mismatch" };
  if (!payload.uid) return { ok: false, error: "code missing uid" };

  const recomputed = pkceChallengeFromVerifier(presentedVerifier);
  if (recomputed !== payload.cc) return { ok: false, error: "pkce mismatch" };

  return { ok: true, userId: payload.uid };
}

export { STATIC_CLIENT_ID };
