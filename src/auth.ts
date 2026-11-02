import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTotpToken } from "@/lib/totp";
import { verifyMfaChallenge } from "@/lib/mfa-challenge";
import { authConfig } from "@/auth.config";
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
      },
      async authorize(credentials, request) {
        const device = parseLoginDevice(request.headers);
        const challenge = credentials?.challenge as string | undefined;
        const otp = credentials?.otp as string | undefined;

        // Step 2 of the MFA flow: /login already verified the password and
        // issued this challenge, so all that's left to prove is the OTP.
        if (challenge) {
          const userId = await verifyMfaChallenge(challenge);
          if (!userId) return null;

          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user || !user.active || !user.mfaEnabled || !user.mfaSecret) return null;
          if (!otp || !verifyTotpToken(otp, user.mfaSecret)) return null;
          if (await refuseIfMobileBlocked(user, device, "password+mfa")) throw new MobileLoginBlockedError();

          await recordLoginEvent({ userId: user.id, device, success: true, method: "password+mfa" });
          return { id: user.id, name: user.name, email: user.email, role: user.role, deviceType: device.deviceType };
        }

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) return null;

        // MFA-enabled users must complete the challenge step above — password
        // alone is never enough for them.
        if (user.mfaEnabled) return null;
        if (await refuseIfMobileBlocked(user, device, "password")) throw new MobileLoginBlockedError();

        await recordLoginEvent({ userId: user.id, device, success: true, method: "password" });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          deviceType: device.deviceType,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.mobile = isMobileDevice(user.deviceType);
        token.mobileCheckedAt = Date.now();
        return token;
      }
      if (token.mobile && Date.now() - ((token.mobileCheckedAt as number | undefined) ?? 0) > MOBILE_RECHECK_MS) {
        const row = await prisma.user.findUnique({
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
      }
      return session;
    },
  },
});
