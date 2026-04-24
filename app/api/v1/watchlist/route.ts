/**
 * GET /api/v1/watchlist — return the user's watchlist
 * PUT /api/v1/watchlist — replace the user's watchlist (full overwrite)
 *
 * Response shape parity with backend/api/routes/watchlist.py.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/auth/context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!;

const WatchlistEntrySchema = z.object({
  ticker: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => /^[A-Z]{1,5}$/.test(v), "Ticker must be 1–5 letters"),
  schedule: z.enum(["1x", "3x", "6x"]),
});

const SaveWatchlistSchema = z.object({
  entries: z.array(WatchlistEntrySchema),
});

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getServiceClient();
  const { data, error } = await sb
    .from("watchlist")
    .select("ticker, schedule")
    .eq("user_id", user.userId)
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function PUT(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 422 });
  }

  const parsed = SaveWatchlistSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const sb = getServiceClient();

  await sb.from("watchlist").delete().eq("user_id", user.userId);

  if (parsed.data.entries.length > 0) {
    const rows = parsed.data.entries.map((e) => ({
      user_id: user.userId,
      ticker: e.ticker,
      schedule: e.schedule,
    }));
    const { error } = await sb.from("watchlist").insert(rows);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data, error } = await sb
    .from("watchlist")
    .select("ticker, schedule")
    .eq("user_id", user.userId)
    .order("created_at");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}
