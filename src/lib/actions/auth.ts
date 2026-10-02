"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMfaChallenge } from "@/lib/mfa-challenge";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getAppUrl, renderEmailLayout, sendEmail } from "@/lib/email";
import {
  createPasswordResetToken,
  matchesPasswordResetToken,
  verifyPasswordResetToken,
} from "@/lib/password-reset";

const CHALLENGE_COOKIE = "mfa_challenge";

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = formData.get("email") as string | null;
  const password = formData.get("password") as string | null;
  if (!email || !password) return { error: "Email and password are required." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { error: "Invalid email or password." };

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) return { error: "Invalid email or password." };

  if (user.mfaEnabled) {
    const token = await createMfaChallenge(user.id);
    const cookieStore = await cookies();
    cookieStore.set(CHALLENGE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 5,
      path: "/",
    });
    redirect("/login/mfa");
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password." };
    throw error;
  }
  return {};
}

// Module-level, in-memory, per-email — same single-instance caveat as the
// public-forms limiter. Caps how many reset emails one address can be sent.
const RESET_WINDOW_MS = 60 * 60 * 1000;
const RESET_MAX = 3;
const resetRequestsByEmail = new Map<string, number[]>();

function isResetRateLimited(email: string): boolean {
  const now = Date.now();
  const recent = (resetRequestsByEmail.get(email) ?? []).filter((t) => now - t < RESET_WINDOW_MS);
  if (recent.length >= RESET_MAX) {
    resetRequestsByEmail.set(email, recent);
    return true;
  }
  recent.push(now);
  resetRequestsByEmail.set(email, recent);
  return false;
}

// Always resolves to the same "sent" state whether or not the email belongs
// to an account, so this form can't be used to find out who has one.
export async function requestPasswordResetAction(
  _prevState: { sent?: boolean; error?: string } | undefined,
  formData: FormData
): Promise<{ sent?: boolean; error?: string }> {
  const email = ((formData.get("email") as string | null) ?? "").trim();
  if (!email) return { error: "Email is required." };

  if (isResetRateLimited(email.toLowerCase())) return { sent: true };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { sent: true };

  try {
    const token = await createPasswordResetToken(user);
    const url = `${getAppUrl()}/login/reset?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      html: renderEmailLayout({
        heading: "Password reset",
        bodyHtml: `<p style="margin:0">We got a request to reset the password for your account. This link expires in 30 minutes and can only be used once.</p>`,
        ctaLabel: "Choose a new password",
        ctaUrl: url,
        preheader: "Use this link to choose a new password.",
        footerHtml: "If you didn't ask for this, you can ignore this email — your password won't change.",
      }),
    });
  } catch (error) {
    // Logged, not surfaced — a different response here would leak that the
    // address belongs to an account.
    console.error("Password reset email failed", error);
  }
  return { sent: true };
}

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
  });

const RESET_LINK_INVALID = "This reset link is invalid or has expired. Request a new one.";

export async function resetPasswordAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const parsed = resetPasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const claims = await verifyPasswordResetToken(String(formData.get("token") ?? ""));
  if (!claims) return { error: RESET_LINK_INVALID };

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user || !user.active || !matchesPasswordResetToken(claims.fp, user.passwordHash)) {
    return { error: RESET_LINK_INVALID };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  // Conditional on the old hash so two submissions of the same link can't
  // both succeed.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: { passwordHash },
  });
  if (count === 0) return { error: RESET_LINK_INVALID };

  await recordAudit({
    entityType: "User",
    entityId: user.id,
    action: "reset_password",
    actorId: user.id,
  });

  redirect("/login?reset=1");
}

export async function verifyMfaAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const otp = formData.get("otp") as string | null;
  const cookieStore = await cookies();
  const challenge = cookieStore.get(CHALLENGE_COOKIE)?.value;
  if (!challenge) return { error: "Your sign-in session expired. Please start over." };

  try {
    await signIn("credentials", { challenge, otp, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid MFA code." };
    throw error;
  }
  cookieStore.delete(CHALLENGE_COOKIE);
  return {};
}

export async function cancelMfaAction() {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
  redirect("/login");
}

export async function hasPendingMfaChallenge() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(CHALLENGE_COOKIE)?.value);
}
