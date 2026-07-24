import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyTotpToken } from "@/lib/totp";
import { verifyMfaChallenge } from "@/lib/mfa-challenge";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "MFA code", type: "text" },
        challenge: { label: "Challenge", type: "text" },
      },
      async authorize(credentials) {
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

          return { id: user.id, name: user.name, email: user.email, role: user.role };
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

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
