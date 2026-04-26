/**
 * GET /api/v1/tournament/[id] — fetch tournament job status and config.
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const sb = getServiceClient();

  const { data, error } = await sb
    .from("tournament_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.userId)
    .single();

  if (error || !data) {
    return Response.json({ error: "Tournament not found" }, { status: 404 });
  }

  return Response.json(data);
}
