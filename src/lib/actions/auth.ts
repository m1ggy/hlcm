"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMfaChallenge } from "@/lib/mfa-challenge";

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
