"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

// Thin re-export so the root layout (a Server Component) can render a
// client boundary without itself becoming "use client". Needed as an
// ancestor of SessionExpiredDialog — useSession() doesn't work without it.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
