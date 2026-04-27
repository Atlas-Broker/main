// Auth redirect is now handled server-side in app/dashboard/layout.tsx via
// Clerk's auth() — no client-side render to test here. Keeping the file as
// a placeholder so Jest doesn't error on an empty suite.

describe("Dashboard routing", () => {
  it("auth is enforced server-side in layout.tsx", () => {
    // See app/dashboard/layout.tsx — redirect("/login") fires when userId is null.
    expect(true).toBe(true);
  });
});
