import { getClerkToken } from "./auth";

export async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  const token = await getClerkToken();
  if (!token) {
    return null;
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    return null;
  }

  return res;
}
