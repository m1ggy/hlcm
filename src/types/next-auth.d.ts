import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      // The tenant this session belongs to — must match the request host's
      // org (checked in src/auth.config.ts and requireSession()).
      organizationId: string;
      orgSlug: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    organizationId: string;
    orgSlug: string;
  }
}
