import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb, tenantDb } from "@/lib/db";
import { getHostOrg, getOrgBySlug, isActivePlatformAdmin } from "@/lib/tenant";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { verifyTotpToken } from "@/lib/totp";
import { verifyMfaChallenge } from "@/lib/mfa-challenge";
import { authConfig, isPublicPath } from "@/auth.config";
import { getClientIp } from "@/lib/rate-limit";
import { clearLoginFailures, isLoginThrottled, recordLoginFailure } from "@/lib/login-throttle";
import { isMobileDevice, parseLoginDevice, recordLoginEvent, refuseIfMobileBlocked } from "@/lib/login-device";

/** Thrown from authorize so the login actions can show the right message. */
export class MobileLoginBlockedError extends CredentialsSignin {
  code = "mobile_blocked";
}

// How often an open phone/tablet session re-checks mobileLoginBlocked, so
// a developer turning it on ends that session within a minute instead of
// waiting for the idle timeout. Desktop sessions never pay for this check.
const MOBILE_RECHECK_MS = 60 * 1000;

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
        supportToken: { label: "Support token", type: "text" },
      },
      // Users are looked up in the request host's organization only (the
      // tenant client adds organizationId to every lookup) — the same email
      // can exist in two orgs, and signing in on one org's host can never
      // produce a session for the other.
      async authorize(credentials, request) {
        const org = await getHostOrg();
        if (!org || org.status !== "ACTIVE") return null;
        const db = await getDb();
        const device = parseLoginDevice(request.headers);
        // Throttled per IP and per account on failures (src/lib/login-throttle.ts)
        // — this is also what guards a direct POST to the credentials endpoint.
        const ip = await getClientIp().catch(() => null);

        // A platform admin entering the workspace (src/lib/support-access.ts):
        // a one-time link from the console, as their own hidden account here.
        // Not subject to the mobile block (a switch for the workspace's own
        // staff), but logged like any other sign-in.
        const supportToken = credentials?.supportToken as string | undefined;
        if (supportToken) {
          const used = await consumeAuthToken(supportToken, ["SUPPORT_LOGIN"]);
          if (!used) return null;
          const user = await db.user.findUnique({ where: { id: used.userId } });
          if (!user || !user.active || !user.isSupport) return null;
          if (!(await isActivePlatformAdmin(user.platformAdminId))) return null;
          await recordLoginEvent({ userId: user.id, device, success: true, method: "support" });
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: org.id,
            orgSlug: org.slug,
            isSupport: true,
            deviceType: device.deviceType,
          };
        }

        const challenge = credentials?.challenge as string | undefined;
        const otp = credentials?.otp as string | undefined;

        // Step 2 of the MFA flow: /login already verified the password and
        // issued this challenge, so all that's left to prove is the OTP.
        if (challenge) {
          const userId = await verifyMfaChallenge(challenge);
          if (!userId) return null;

          const user = await db.user.findUnique({ where: { id: userId } });
          if (!user || !user.active || user.isSupport || !user.mfaEnabled || !user.mfaSecret) return null;
          if (isLoginThrottled(ip, org.id, user.email)) return null;
          if (!otp || !verifyTotpToken(otp, user.mfaSecret)) {
            recordLoginFailure(ip, org.id, user.email);
            return null;
          }
          if (await refuseIfMobileBlocked(user, device, "password+mfa")) throw new MobileLoginBlockedError();

          clearLoginFailures(org.id, user.email);
          await recordLoginEvent({ userId: user.id, device, success: true, method: "password+mfa" });
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: org.id,
            orgSlug: org.slug,
            deviceType: device.deviceType,
          };
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        if (isLoginThrottled(ip, org.id, email)) return null;

        const user = await db.user.findFirst({ where: { email } });
        const passwordValid = user?.active && !user.isSupport ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!user || !passwordValid) {
          recordLoginFailure(ip, org.id, email);
          return null;
        }

        // MFA-enabled users must complete the challenge step above — password
        // alone is never enough for them.
        if (user.mfaEnabled) return null;
        if (await refuseIfMobileBlocked(user, device, "password")) throw new MobileLoginBlockedError();

        clearLoginFailures(org.id, email);
        await recordLoginEvent({ userId: user.id, device, success: true, method: "password" });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: org.id,
          orgSlug: org.slug,
          deviceType: device.deviceType,
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
        token.isSupport = user.isSupport ?? false;
        token.mobile = isMobileDevice(user.deviceType);
        token.mobileCheckedAt = Date.now();
        return token;
      }
      if (token.mobile && Date.now() - ((token.mobileCheckedAt as number | undefined) ?? 0) > MOBILE_RECHECK_MS) {
        const row = await tenantDb(token.organizationId as string).user.findUnique({
          where: { id: token.id as string },
          select: { mobileLoginBlocked: true, active: true },
        });
        // Returning null ends the session — the next page load lands on /login.
        if (!row || !row.active || row.mobileLoginBlocked) return null;
        token.mobileCheckedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = token.organizationId as string;
        session.user.orgSlug = token.orgSlug as string;
        session.user.isSupport = Boolean(token.isSupport);
      }
      return session;
    },
  },
});
