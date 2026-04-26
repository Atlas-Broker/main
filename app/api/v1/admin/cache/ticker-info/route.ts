import { getUserFromRequest } from "@/lib/auth/context";
import { getServiceClient } from "@/lib/supabase-server";

// DELETE /api/v1/admin/cache/ticker-info — truncate ticker_info_cache (admin+)
export async function DELETE(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.userId)
    .maybeSingle();

  const role = (profile as Record<string, unknown> | null)?.["role"] as string | undefined;
  if (!role || !["admin", "superadmin"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { count, error } = await supabase
    .from("ticker_info_cache")
    .delete({ count: "exact" })
    .neq("ticker", "");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ cleared: count ?? 0 });
}
