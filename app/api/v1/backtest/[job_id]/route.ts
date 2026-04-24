/**
 * GET    /api/v1/backtest/:job_id  — fetch a single backtest job.
 * DELETE /api/v1/backtest/:job_id  — delete a job (cannot delete running jobs).
 *
 * Response shape parity with backend/api/routes/backtest.py.
 */
import { createClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/auth/context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

interface RouteContext {
  params: Promise<{ job_id: string }>;
}

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job_id } = await ctx.params;
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("backtest_jobs")
    .select("*")
    .eq("id", job_id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const job = data as Record<string, unknown>;

  // Enforce ownership — 403 if the job belongs to a different user
  if (job["user_id"] !== user.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json(data);
}

export async function DELETE(req: Request, ctx: RouteContext): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job_id } = await ctx.params;
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("backtest_jobs")
    .select("id, user_id, status")
    .eq("id", job_id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const job = data as Record<string, unknown>;

  if (job["user_id"] !== user.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (job["status"] === "running") {
    return Response.json(
      { error: "Cannot delete a running job." },
      { status: 409 }
    );
  }

  const { error: deleteError } = await sb
    .from("backtest_jobs")
    .delete()
    .eq("id", job_id);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({ deleted: true });
}
