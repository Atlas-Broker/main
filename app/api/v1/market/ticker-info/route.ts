import { NextRequest, NextResponse } from "next/server";
import { fetchTickerInfoCached } from "@/lib/market";

/**
 * GET /api/v1/market/ticker-info?symbol=AAPL
 *
 * Returns the 18-field AtlasTickerInfo for the given symbol.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const symbol = request.nextUrl.searchParams.get("symbol");

  if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
    return NextResponse.json(
      { success: false, data: null, error: "Missing required query parameter: symbol" },
      { status: 400 }
    );
  }

  try {
    const info = await fetchTickerInfoCached(symbol.trim().toUpperCase());
    return NextResponse.json({ success: true, data: info, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 }
    );
  }
}
