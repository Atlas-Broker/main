/**
 * GET /api/v1/health
 *
 * Simple health check endpoint — no auth required.
 * Returns service status and current timestamp.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    status: "ok",
    service: "atlas-frontend",
    timestamp: new Date().toISOString(),
  });
}
