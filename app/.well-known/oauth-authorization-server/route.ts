import {
  createAuthorizationServerRoute,
  createDiscoveryOptionsRoute,
} from "@/lib/mcp-discovery";

export const runtime = "nodejs";
export const dynamic = "force-static";

export const GET = createAuthorizationServerRoute();
export const OPTIONS = createDiscoveryOptionsRoute();
