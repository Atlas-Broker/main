# Auth — Clerk + Google OAuth Design Spec

> Sprint 1 of 4. Prerequisite for all Supabase integration work.
> Revised after spec review 2026-03-17.

---

## Overview

Replace the current unauthenticated state with Clerk-based authentication using Google OAuth. The landing page remains public with a waitlist CTA. All other routes require a verified Clerk session.

**Auth provider:** Clerk (embedded components, not hosted pages)
**OAuth provider:** Google (via Clerk)
**Waitlist:** Clerk waitlist mode — new signups held pending until manually approved in Clerk dashboard
**Supabase access:** Backend-only via service key + manual `user_id` filtering. No Clerk JWT sent to Supabase. No `auth.uid()` RLS dependency.

---

## Architecture

```
Browser (Next.js + Clerk)
  ClerkProvider wraps entire app (app/layout.tsx)
  middleware.ts — clerkMiddleware() protects all routes except / and /login
  useAuth() → Clerk session token

Public routes:   /  (landing + waitlist CTA)
                 /login
Protected:       /dashboard, /admin, all others

Token flow:
  Frontend: getToken() → Clerk JWT (signed by Clerk, sub = Clerk user ID)
  All fetchWithAuth() calls: Authorization: Bearer <clerk-jwt>
  FastAPI middleware: verify JWT via Clerk JWKS (public key, no secret needed) → extract user_id
  All Supabase queries: backend service key + explicit .eq("user_id", user_id) filter

JWKS verification:
  FastAPI fetches Clerk JWKS on startup, caches with 1-hour TTL
  Background refresh on cache miss to handle key rotation
  No CLERK_SECRET_KEY needed for JWT verification
```

---

## Database dependency

Requires the database migration spec (`2026-03-17-database-migration-design.md`) to be applied first. The new `profiles.id TEXT` column stores Clerk user IDs directly.

---

## Frontend

### New files

| File | Purpose |
|------|---------|
| `middleware.ts` | `clerkMiddleware()` v5 syntax — protects all routes, allows `/` and `/login` |
| `app/login/page.tsx` | Renders `<SignIn />` with Atlas dark theme appearance |
| `lib/auth.ts` | `getClerkToken()` — wraps Clerk `getToken()` |
| `lib/api.ts` | `fetchWithAuth(url, options)` — attaches Bearer token; handles null token (expired session → redirect /login); handles 401 response → redirect /login |
| `components/UserMenu.tsx` | Avatar + display name + Sign out button in dashboard nav |

### Modified files

| File | Change |
|------|--------|
| `app/layout.tsx` | Wrap with `<ClerkProvider publishableKey={NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>` |
| `app/page.tsx` (landing) | Add "Join the waitlist" CTA button → Clerk Google OAuth |
| `app/dashboard/page.tsx` | Replace all raw `fetch()` calls with `fetchWithAuth()` |
| `app/admin/page.tsx` | Replace all raw `fetch()` calls with `fetchWithAuth()` |

### Route protection (v5 syntax)

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/login(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

### Clerk appearance theme (Atlas dark)

```typescript
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#22c55e",
    colorBackground: "#0f0f0f",
    fontFamily: "Nunito Sans, sans-serif",
  },
};
```

### `fetchWithAuth` contract

`fetchWithAuth` is a **client-side** async utility (`"use client"` context). It cannot use `redirect()` from `next/navigation` (that is server-side only). Navigation uses `router.push()` obtained via `useRouter()`, passed in or accessed via a module-level router reference.

```typescript
// lib/api.ts
// Returns null on auth failure — callers must handle null and navigate
async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response | null> {
  const token = await getToken();
  if (!token) {
    // Token unavailable — session expired. Caller redirects via router.push.
    return null;
  }
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;  // Caller redirects
  return res;
}

// Callers in dashboard/page.tsx:
const res = await fetchWithAuth(`${API_URL}/v1/portfolio`);
if (!res) { router.push("/login"); return; }
```

### Waitlist extendability

Landing "Join waitlist" → Clerk Google OAuth → Clerk holds as `pending`. On approval, `user.created` webhook fires. Future onboarding (display_name, trading experience) is collected post-login via `/onboarding` page writing to `profiles` — gated by `onboarding_completed = false`. **`/onboarding` page is out of scope for this sprint** — the `onboarding_completed` column is added to the schema and the flag exists; the page is deferred.

### `/admin` authorization

For this sprint, `/admin` is protected by Clerk auth (any approved user). Admin-only restriction via Clerk roles/metadata is **deferred to a later sprint**. Document in README that `/admin` should not be shared publicly until RBAC is added.

---

## Backend

### New files

| File | Purpose |
|------|---------|
| `backend/api/middleware/auth.py` | Clerk JWT verification via JWKS; attaches `user_id` to `request.state` |
| `backend/api/routes/webhooks.py` | `POST /webhooks/clerk` — Svix signature verification → create profile + portfolio |
| `backend/services/profile_service.py` | `create_profile()`, `get_profile()`, `update_profile()` |

### Modified files

| File | Change |
|------|--------|
| `backend/main.py` | Add auth middleware (excludes `/health`, `/webhooks/clerk`, `/docs` in dev only); include webhooks router |
| All route handlers | Add `user_id: str = Depends(get_current_user)` |

### Auth middleware

```python
# backend/api/middleware/auth.py
# - Fetches Clerk JWKS on startup, caches with 1-hour TTL + background refresh on miss
# - CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"
# - Verifies RS256 JWT signature, checks exp claim
# - Sets request.state.user_id = payload["sub"]  (e.g. "user_2abc...")
# - Raises HTTP 401 for invalid/expired/missing tokens
# - Public paths bypass list (checked BEFORE auth): /health, /webhooks/clerk
# - /docs bypass: included in public paths when ENVIRONMENT != "production"
#   This means the ENVIRONMENT check runs inside the middleware bypass logic,
#   so unauthenticated requests to /docs in dev reach FastAPI's doc handler correctly.
# - In production, /docs is NOT in the bypass list → hits auth middleware → 401
# - get_current_user() FastAPI dependency reads request.state.user_id

def get_current_user(request: Request) -> str:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id
```

### Webhook handler

```python
# POST /webhooks/clerk
# 1. Verify Svix webhook signature using CLERK_WEBHOOK_SECRET env var
# 2. On event type "user.created":
#    - Extract: user_id (event.data.id), email, display_name (first_name + last_name)
#    - supabase.table("profiles").upsert({
#        "id": user_id,
#        "email": email,
#        "display_name": display_name,
#        "boundary_mode": "advisory",
#        "onboarding_completed": False
#      })
#    - portfolio_service.get_or_create_portfolio(user_id)  # pre-create default portfolio
# 3. Return 200 (idempotent — upsert handles re-delivery)
```

---

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend | Clerk publishable key (safe for browser) |
| `CLERK_SECRET_KEY` | Backend | Clerk management API calls (waitlist approval, user lookup) |
| `CLERK_WEBHOOK_SECRET` | Backend | Svix webhook signature verification |
| `CLERK_JWKS_URL` | Backend | `https://api.clerk.com/v1/jwks` (public key endpoint, no secret required) |

> All keys to be provided by user before implementation begins.

---

## Error handling

| Scenario | Response |
|----------|----------|
| Invalid / expired JWT | 401 — frontend redirects to `/login` |
| null token (expired session) | `fetchWithAuth` redirects to `/login` before sending request |
| Webhook signature invalid | 400 — logged server-side, no profile created |
| Profile already exists on webhook | Upsert — idempotent, no error |
| Google OAuth denied by user | Clerk handles — returns to `/login` |
| User not yet approved (waitlist) | Clerk blocks — shows "pending approval" UI |
| `/docs` in production | 404 (disabled by ENVIRONMENT check in main.py) |

---

## Testing

| Type | What |
|------|------|
| Unit | JWT middleware: valid RS256 token, expired token (exp in past), malformed token, missing Authorization header |
| Unit | JWT middleware: token obtained just before expiry (clock-skew within 30s tolerance) |
| Unit | `fetchWithAuth`: null token → redirect; 401 response → redirect; 200 → returns response |
| Unit | JWKS cache: valid cache hit, cache miss triggers background refresh |
| Integration | Webhook: valid Svix signature → profile + portfolio created |
| Integration | Webhook: invalid Svix signature → 400, no DB write |
| Integration | Protected route with valid token → 200 |
| Integration | Protected route without token → 401 |
| Integration | `/docs` returns 404 when ENVIRONMENT=production |
| E2E | Full Google OAuth login flow in Clerk test mode |
| E2E | Unauthenticated request to `/dashboard` → redirected to `/login` → after login → back to `/dashboard` |

---

## What this unblocks

- Sprint 2: Supabase integration (`user_id` available in every request via `get_current_user`)
- Sprint 3: Override window (verify user owns trade before cancelling)
- Sprint 4: Signal rejection (verify user owns signal)
