import type { NextAuthConfig } from "next-auth";
import { orgSlugFromHost, requestHost } from "@/lib/tenant-host";

// Edge-safe base config shared by middleware and the full server config.
// No providers here — Credentials + Prisma/bcrypt live only in auth.ts,
// which never runs in the Edge middleware runtime.
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      // A session only counts on its own org's host. A token from another
      // org (or a pre-multitenancy token with no org at all) is treated as
      // logged out. Session cookies are host-only, so a browser never sends
      // one across subdomains anyway — this covers a hand-copied cookie.
      const hostSlug = orgSlugFromHost(requestHost(request.headers));
      const isLoggedIn = !!auth?.user && !!hostSlug && auth.user.orgSlug === hostSlug;
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;

/** Paths anyone may open without a session (or with one from any state). */
export function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/login") ||
    // Password reset + invite acceptance (src/lib/actions/password.ts) —
    // the whole point is that there's no session yet.
    pathname.startsWith("/forgot-password") ||
    // "Find your workspace" on the bare root domain (no org, no session).
    pathname.startsWith("/find-workspace") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/handbook") ||
    // Stripe calls this directly with no session — it's authenticated
    // by signature (see verifyWebhookSignature), not by cookie. Without
    // this, the proxy 307-redirects every webhook POST to /login before
    // it ever reaches the route handler.
    pathname.startsWith("/api/webhooks") ||
    // Caddy's certificate gate — asked with no session (src/app/api/tls-check).
    pathname.startsWith("/api/tls-check") ||
    // The public intake-form fill/submit page — the one place in the
    // app anyone can write to with no session at all (see
    // src/lib/actions/public-forms.ts). The admin builder (/admin/forms)
    // and the submissions inbox (/form-submissions — deliberately NOT
    // under /forms/*, to stay clear of this exact prefix check) live
    // under (dashboard) and stay behind the normal auth check.
    pathname.startsWith("/forms/")
  );
}
