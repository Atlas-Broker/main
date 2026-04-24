/**
 * PATCH /api/v1/admin/users/:user_id/tier — update tier (superadmin only)
 * PATCH /api/v1/admin/users/:user_id/role — update role (superadmin only)
 *
 * The field to update is passed as ?field=tier or ?field=role.
 *
 * Port of backend/api/routes/admin.py patch endpoints.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const TierSchema = z.object({ tier: z.enum(["free", "pro", "max"]) });
const RoleSchema = z.object({ role: z.enum(["user", "admin", "superadmin"]) });

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

async function requireSuperadmin(req: Request): Promise<{ userId: string } | null> {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const sb = getServiceClient();
  const { data } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.userId)
    .maybeSingle();
  const role = (data as Record<string, unknown> | null)?.["role"] as string | undefined;
  return role === "superadmin" ? user : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const admin = await requireSuperadmin(req);
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { user_id } = await params;
  const url = new URL(req.url);
  const field = url.searchParams.get("field");

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const sb = getServiceClient();

  if (field === "tier") {
    const parsed = TierSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 422 });
    }
    const { data, error } = await sb
      .from("profiles")
      .update({ tier: parsed.data.tier })
      .eq("id", user_id)
      .select()
      .single();
    if (error || !data) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json(data);
  }

  if (field === "role") {
    const parsed = RoleSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 422 });
    }
    const { data, error } = await sb
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", user_id)
      .select()
      .single();
    if (error || !data) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json(data);
  }

  return Response.json({ error: "field must be 'tier' or 'role'" }, { status: 422 });
}
