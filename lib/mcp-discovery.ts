/**
 * Dep-less MCP OAuth discovery module.
 *
 * RULE: this file imports NOTHING beyond next/server and Node built-ins.
 * No Clerk. No Supabase. No DB clients. No env secrets read at module eval.
 *
 * Claude's MCP connector walks three .well-known/* discovery routes on every
 * cold connection. Each route is its own Vercel lambda. Any heavy transitive
 * import blows past the ~10s cold-start ceiling and Claude gives up silently.
 *
 * If you find yourself needing auth, DB, or secrets here: STOP. Those belong
 * in /oauth/token, not discovery.
 */
import { NextResponse } from "next/server";

const BASE_URL = (
  process.env.NEXT_PUBLIC_MCP_BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://atlas-broker-uat.vercel.app"
).replace(/\/$/, "");

const MCP_RESOURCE = `${BASE_URL}/api/mcp/docs`;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
};

export function protectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: [BASE_URL],
    bearer_methods_supported: ["header"],
    resource_documentation: `${BASE_URL}/api/mcp/docs`,
    scopes_supported: ["mcp:docs"],
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:docs"],
    service_documentation: `${BASE_URL}/api/mcp/docs`,
  };
}

export function openIdConfigurationMetadata() {
  return {
    ...authorizationServerMetadata(),
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["none"],
  };
}

function jsonRoute<T>(factory: () => T) {
  return async () => NextResponse.json(factory(), { headers: JSON_HEADERS });
}

export function createProtectedResourceRoute() {
  return jsonRoute(protectedResourceMetadata);
}

export function createAuthorizationServerRoute() {
  return jsonRoute(authorizationServerMetadata);
}

export function createOpenIdConfigurationRoute() {
  return jsonRoute(openIdConfigurationMetadata);
}

export function createDiscoveryOptionsRoute() {
  return async () =>
    new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
      },
    });
}

export { BASE_URL, MCP_RESOURCE };
