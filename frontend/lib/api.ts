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

export type UserRole = "user" | "admin" | "superadmin";

export type MyProfile = {
  id: string;
  boundary_mode: string;
  display_name: string | null;
  email: string;
  onboarding_completed: boolean;
  role: UserRole;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const res = await fetchWithAuth(`${API_URL}/v1/profile/me`);
  if (!res || !res.ok) return null;
  return res.json() as Promise<MyProfile>;
}
