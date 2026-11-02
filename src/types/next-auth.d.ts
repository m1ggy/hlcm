import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    /** Set by authorize — see src/lib/login-device.ts. */
    deviceType?: string;
  }
}
