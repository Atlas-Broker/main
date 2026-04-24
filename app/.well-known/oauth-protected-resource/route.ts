import {
  createDiscoveryOptionsRoute,
  createProtectedResourceRoute,
} from "@/lib/mcp-discovery";

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = createProtectedResourceRoute();
export const OPTIONS = createDiscoveryOptionsRoute();
