export const createRouteMatcher = jest.fn(
  (patterns: string[]) =>
    (req: { nextUrl?: { pathname?: string }; url?: string }) => {
      const pathname =
        req.nextUrl?.pathname ?? new URL(req.url ?? "/").pathname;
      return patterns.some((p) => {
        const regex = new RegExp(
          "^" + p.replace(/\(\.\*\)/g, ".*").replace(/\//g, "\\/") + "$"
        );
        return regex.test(pathname);
      });
    }
);

export const clerkMiddleware = jest.fn();
export const auth = jest.fn();
export const currentUser = jest.fn();
