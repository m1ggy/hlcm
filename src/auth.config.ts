import type { NextAuthConfig } from "next-auth";

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
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublicPath =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/handbook") ||
        // Stripe calls this directly with no session — it's authenticated
        // by signature (see verifyWebhookSignature), not by cookie. Without
        // this, the proxy 307-redirects every webhook POST to /login before
        // it ever reaches the route handler.
        pathname.startsWith("/api/webhooks");
      if (isPublicPath) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
