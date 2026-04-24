/**
 * GET    /api/v1/experiments/:exp_id — get experiment with jobs (admin only)
 * DELETE /api/v1/experiments/:exp_id — delete experiment (admin only)
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

async function requireAdmin(req: Request): Promise<{ userId: string } | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const sb = getServiceClient();
  const { data } = await sb.from("profiles").select("role").eq("id", user.userId).maybeSingle();
  const role = (data as Record<string, unknown> | null)?.["role"] as string | undefined;
  return role && ["admin", "superadmin"].includes(role) ? user : null;
}

export async function GET(
  req: Request,
  { params }: { params: { exp_id: string } },
): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = getServiceClient();
  const { data: exp, error } = await sb
    .from("backtest_experiments")
    .select("*")
    .eq("id", params.exp_id)
    .eq("user_id", admin.userId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!exp) return Response.json({ error: "Experiment not found" }, { status: 404 });

  const { data: jobs } = await sb
    .from("backtest_jobs")
    .select("*")
    .eq("experiment_id", params.exp_id)
    .eq("user_id", admin.userId);

  return Response.json({ ...exp, jobs: jobs ?? [] });
}

export async function DELETE(
  req: Request,
  { params }: { params: { exp_id: string } },
): Promise<Response> {
  const admin = await requireAdmin(req);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sb = getServiceClient();
  const { data: existing } = await sb
    .from("backtest_experiments")
    .select("id")
    .eq("id", params.exp_id)
    .eq("user_id", admin.userId)
    .maybeSingle();

  if (!existing) return Response.json({ error: "Experiment not found" }, { status: 404 });

  await sb
    .from("backtest_experiments")
    .delete()
    .eq("id", params.exp_id)
    .eq("user_id", admin.userId);

  return Response.json({ deleted: true });
}
