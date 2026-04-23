/**
 * GET /api/v1/schedules  — return the user's 6-window schedule preferences.
 * PUT /api/v1/schedules  — replace the user's schedule preferences.
 *
 * Backed by the `user_schedules` table in Supabase.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

const ScheduleEntrySchema = z.object({
  window: z.string().min(1),
  enabled: z.boolean(),
});

const SchedulesBodySchema = z.object({
  schedules: z.array(ScheduleEntrySchema),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();

  const { data, error } = await sb
    .from("user_schedules")
    .select("window, enabled")
    .eq("user_id", user.userId)
    .order("window", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = SchedulesBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const sb = getServiceClient();

  // Delete existing schedules for this user, then insert new ones (full overwrite)
  const { error: deleteError } = await sb
    .from("user_schedules")
    .delete()
    .eq("user_id", user.userId);

  if (deleteError) {
    return Response.json({ error: deleteError.message }, { status: 500 });
  }

  const rows = parsed.data.schedules.map((s) => ({
    user_id: user.userId,
    window: s.window,
    enabled: s.enabled,
  }));

  const { data, error: insertError } = await sb
    .from("user_schedules")
    .insert(rows)
    .select("window, enabled");

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}
