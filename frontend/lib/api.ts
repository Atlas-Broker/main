import { getClerkToken } from "./auth";

export async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  const token = await getClerkToken();
  if (!token) {
    return null;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.error("fetchWithAuth: network error fetching", url, err);
    return null;
  }

  if (res.status === 401) {
    return null;
  }

  return res;
}
