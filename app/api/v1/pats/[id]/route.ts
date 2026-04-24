import { getUserFromRequest } from "@/lib/auth/context";
import { getServiceClient } from "@/lib/supabase-server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sb = getServiceClient();

  const { error, count } = await sb
    .from("user_pats")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!count || count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
