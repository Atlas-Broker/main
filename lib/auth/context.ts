import { auth } from "@clerk/nextjs/server";

export interface AuthUser {
  userId: string;
}

/**
 * Extracts the authenticated user from the current request context.
 * Works with @clerk/nextjs v7+ server-side auth().
 *
 * Returns null if the request is unauthenticated.
 */
export async function getUserFromRequest(
  _req?: Request
): Promise<AuthUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return { userId };
}
