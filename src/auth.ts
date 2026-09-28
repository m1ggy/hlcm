import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { getHostOrg, getOrgBySlug } from "@/lib/tenant";
import { verifyTotpToken } from "@/lib/totp";
import { verifyMfaChallenge } from "@/lib/mfa-challenge";
import { authConfig, isPublicPath } from "@/auth.config";
import { getClientIp } from "@/lib/rate-limit";
import { clearLoginFailures, isLoginThrottled, recordLoginFailure } from "@/lib/login-throttle";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // HIPAA-appropriate idle timeout: session expires 15 min after last
  // activity; each request within that window rolls the expiry forward.
  session: { strategy: "jwt", maxAge: 15 * 60, updateAge: 5 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "MFA code", type: "text" },
        challenge: { label: "Challenge", type: "text" },
      },
      // Users are looked up in the request host's organization only (the
      // tenant client adds organizationId to every lookup) — the same email
      // can exist in two orgs, and signing in on one org's host can never
      // produce a session for the other.
      async authorize(credentials) {
        const org = await getHostOrg();
        if (!org || org.status !== "ACTIVE") return null;
        const db = await getDb();
        // Throttled per IP and per account on failures (src/lib/login-throttle.ts)
        // — this is also what guards a direct POST to the credentials endpoint.
        const ip = await getClientIp().catch(() => null);

        const challenge = credentials?.challenge as string | undefined;
        const otp = credentials?.otp as string | undefined;

        // Step 2 of the MFA flow: /login already verified the password and
        // issued this challenge, so all that's left to prove is the OTP.
        if (challenge) {
          const userId = await verifyMfaChallenge(challenge);
          if (!userId) return null;

          const user = await db.user.findUnique({ where: { id: userId } });
          if (!user || !user.active || !user.mfaEnabled || !user.mfaSecret) return null;
          if (isLoginThrottled(ip, org.id, user.email)) return null;
          if (!otp || !verifyTotpToken(otp, user.mfaSecret)) {
            recordLoginFailure(ip, org.id, user.email);
            return null;
          }

          clearLoginFailures(org.id, user.email);
          return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: org.id, orgSlug: org.slug };
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        if (isLoginThrottled(ip, org.id, email)) return null;

        const user = await db.user.findFirst({ where: { email } });
        const passwordValid = user?.active ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!user || !passwordValid) {
          recordLoginFailure(ip, org.id, email);
          return null;
        }

        // MFA-enabled users must complete the challenge step above — password
        // alone is never enough for them.
        if (user.mfaEnabled) return null;

        clearLoginFailures(org.id, email);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: org.id,
          orgSlug: org.slug,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // The proxy's check (Node runtime here, so it can look the org up): on top
    // of the host rule in auth.config.ts, a session only counts while its
    // organization is ACTIVE — suspending a workspace signs everyone out of
    // it at once instead of leaving open sessions on pages that can't load.
    async authorized(params) {
      const allowed = authConfig.callbacks.authorized(params);
      if (!allowed || !params.auth?.user || isPublicPath(params.request.nextUrl.pathname)) return allowed;
      const org = await getOrgBySlug(params.auth.user.orgSlug);
      return org?.status === "ACTIVE";
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.orgSlug = user.orgSlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        session.user.orgSlug = token.orgSlug as string;
      }
      return session;
    },
  },
});
