#!/usr/bin/env tsx
/**
 * API parity check script.
 *
 * Hits each /api/v1/* endpoint with a test auth token, asserts that the
 * response JSON has the expected top-level keys, and exits non-zero if any
 * assertion fails.
 *
 * Usage:
 *   TEST_AUTH_TOKEN=<clerk-jwt> BASE_URL=http://localhost:3000 \
 *     tsx scripts/api-parity-check.ts
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN ?? "";

if (!TEST_AUTH_TOKEN) {
  console.error("Error: TEST_AUTH_TOKEN environment variable is required");
  process.exit(1);
}

interface EndpointSpec {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  expectedKeys: string[];
  body?: unknown;
  /** If true, accept 401/403/422/404 as "endpoint exists" */
  allowAuthError?: boolean;
}

const ENDPOINT_SPECS: EndpointSpec[] = [
  {
    method: "GET",
    path: "/api/v1/health",
    expectedKeys: ["status", "service", "timestamp"],
    allowAuthError: false,
  },
  {
    method: "GET",
    path: "/api/v1/portfolio",
    expectedKeys: ["total_value", "cash", "pnl_today", "pnl_total", "positions"],
    allowAuthError: true,
  },
  {
    method: "GET",
    path: "/api/v1/signals",
    expectedKeys: [],
    allowAuthError: true,
  },
  {
    method: "GET",
    path: "/api/v1/backtest",
    expectedKeys: [],
    allowAuthError: true,
  },
  {
    method: "GET",
    path: "/api/v1/schedules",
    expectedKeys: [],
    allowAuthError: true,
  },
  {
    method: "GET",
    path: "/api/v1/user/settings",
    expectedKeys: ["id", "boundary_mode", "investment_philosophy"],
    allowAuthError: true,
  },
];

interface CheckResult {
  path: string;
  method: string;
  status: number;
  passed: boolean;
  error?: string;
}

async function checkEndpoint(spec: EndpointSpec): Promise<CheckResult> {
  const url = `${BASE_URL}${spec.path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(url, {
      method: spec.method,
      headers,
      body: spec.body ? JSON.stringify(spec.body) : undefined,
    });

    const status = res.status;

    // If endpoint requires auth and we got an auth error, that's still a pass
    if (spec.allowAuthError && [401, 403].includes(status)) {
      return { path: spec.path, method: spec.method, status, passed: true };
    }

    // 404 at the routing level = endpoint doesn't exist at all
    if (status === 404) {
      return {
        path: spec.path,
        method: spec.method,
        status,
        passed: false,
        error: "404 — route not found",
      };
    }

    if (!res.ok && !spec.allowAuthError) {
      return {
        path: spec.path,
        method: spec.method,
        status,
        passed: false,
        error: `Unexpected status ${status}`,
      };
    }

    if (spec.expectedKeys.length === 0) {
      return { path: spec.path, method: spec.method, status, passed: true };
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        path: spec.path,
        method: spec.method,
        status,
        passed: false,
        error: `Non-JSON response: ${text.slice(0, 100)}`,
      };
    }

    const obj = json as Record<string, unknown>;
    const missingKeys = spec.expectedKeys.filter((k) => !(k in obj));

    if (missingKeys.length > 0) {
      return {
        path: spec.path,
        method: spec.method,
        status,
        passed: false,
        error: `Missing keys: ${missingKeys.join(", ")}`,
      };
    }

    return { path: spec.path, method: spec.method, status, passed: true };
  } catch (err) {
    return {
      path: spec.path,
      method: spec.method,
      status: 0,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  console.log(`\nAtlas API Parity Check`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Checking ${ENDPOINT_SPECS.length} endpoints...\n`);

  const results = await Promise.all(ENDPOINT_SPECS.map(checkEndpoint));

  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    const statusStr = r.status > 0 ? ` [${r.status}]` : "";
    const errorStr = r.error ? ` — ${r.error}` : "";
    console.log(`  ${icon} ${r.method} ${r.path}${statusStr}${errorStr}`);
  }

  console.log(`\nResults: ${passed.length}/${results.length} passed`);

  if (failed.length > 0) {
    console.error(`\nFailed endpoints:`);
    for (const r of failed) {
      console.error(`  ${r.method} ${r.path}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
