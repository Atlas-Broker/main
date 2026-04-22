import {
  createDiscoveryOptionsRoute,
  createOpenIdConfigurationRoute,
} from "@/lib/mcp-discovery";

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = createOpenIdConfigurationRoute();
export const OPTIONS = createDiscoveryOptionsRoute();
