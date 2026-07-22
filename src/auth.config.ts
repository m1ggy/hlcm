import type { NextAuthConfig } from "next-auth";

// Edge-safe base config shared by middleware and the full server config.
// No providers here — Credentials + Prisma/bcrypt live only in auth.ts,
// which never runs in the Edge middleware runtime.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublicPath =
        pathname.startsWith("/login") || pathname.startsWith("/api/auth");
      if (isPublicPath) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
