"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { getHostOrg } from "@/lib/tenant";
import { isValidOrgSlug, PLATFORM_SLUG } from "@/lib/tenant-host";
import { homePathForRole } from "@/lib/workspace-kind";
import { parseLoginIdentifier, pickLoginUser } from "@/lib/login-identifier";
import { createMfaChallenge } from "@/lib/mfa-challenge";
import { getClientIp } from "@/lib/rate-limit";
import { isLoginThrottled, recordLoginFailure, THROTTLED_MESSAGE } from "@/lib/login-throttle";
import { MOBILE_BLOCKED_MESSAGE, parseLoginDevice, refuseIfMobileBlocked } from "@/lib/login-device";
import { switchBackPath } from "@/lib/workspace-switch";
import { forgetLinkedHome } from "@/lib/linked-home";

const CHALLENGE_COOKIE = "mfa_challenge";
// Carries "go back to that client workspace" (switchBackPath) across the MFA step.
const RETURN_COOKIE = "login_return";

/** Signing in again to get back into a client workspace (src/app/login/page.tsx): where to go after. */
function switchBackFrom(formData: FormData, hereSlug: string): string | null {
  const slug = String(formData.get("workspace") ?? "");
  if (!slug || slug === hereSlug || !isValidOrgSlug(slug)) return null;
  return switchBackPath(slug, String(formData.get("next") ?? ""));
}

function isMobileBlocked(error: unknown) {
  return error instanceof CredentialsSignin && error.code === "mobile_blocked";
}

export async function loginAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  // An email, or the phone number of someone who signs in with one
  // (src/lib/login-identifier.ts). The field keeps its old name.
  const email = formData.get("email") as string | null;
  const password = formData.get("password") as string | null;
  if (!email || !password) return { error: "Email or phone, and password, are required." };
  const identifier = parseLoginIdentifier(email);
  if (!identifier) return { error: "Enter your email, or the phone number on your account." };

  // No organization behind this host (unknown subdomain, suspended org, or
  // the bare root domain) — nothing to sign in to.
  const org = await getHostOrg();
  if (!org || org.status !== "ACTIVE") return { error: "This workspace doesn't exist. Check the address you're signing in at." };

  // Failed attempts are throttled per IP and per account (src/lib/login-throttle.ts).
  const ip = await getClientIp();
  if (isLoginThrottled(ip, org.id, identifier.key)) return { error: THROTTLED_MESSAGE };

  // Scoped to the request host's org — see authorize() in src/auth.ts.
  const user = pickLoginUser(await db.user.findMany({ where: identifier.where, take: 2 }));
  const passwordValid = user?.active && !user.isSupport && !user.assignedFromUserId ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordValid) {
    recordLoginFailure(ip, org.id, identifier.key);
    return { error: identifier.kind === "phone" ? "Invalid phone number or password." : "Invalid email or password." };
  }

  // Checked here too (not only in authorize) so a blocked MFA user is told
  // before being sent to the code step. Only after the password is proven,
  // so this can't be used to learn anything about an account.
  if (await refuseIfMobileBlocked(user, parseLoginDevice(await headers()), user.mfaEnabled ? "password+mfa" : "password")) {
    return { error: MOBILE_BLOCKED_MESSAGE };
  }

  const switchBack = switchBackFrom(formData, org.slug);
  // Signing in with a password here means this host isn't (only) a linked
  // account's: stop sending its sign-in page elsewhere (src/lib/linked-home.ts).
  if (!switchBack) await forgetLinkedHome();

  if (user.mfaEnabled) {
    const token = await createMfaChallenge(user.id);
    const cookieStore = await cookies();
    if (switchBack) {
      cookieStore.set(RETURN_COOKIE, switchBack, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 5, path: "/" });
    } else {
      cookieStore.delete(RETURN_COOKIE);
    }
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
    await signIn("credentials", { email, password, redirectTo: switchBack ?? (org.slug === PLATFORM_SLUG ? "/platform" : homePathForRole(org, user.role)) });
  } catch (error) {
    if (isMobileBlocked(error)) return { error: MOBILE_BLOCKED_MESSAGE };
    if (error instanceof AuthError) return { error: identifier.kind === "phone" ? "Invalid phone number or password." : "Invalid email or password." };
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
    // Platform admins land on the console, everyone else on their dashboard.
    const org = await getHostOrg();
    const switchBack = cookieStore.get(RETURN_COOKIE)?.value;
    const home = org?.slug === PLATFORM_SLUG ? "/platform" : homePathForRole(org, null);
    // Kept through a mistyped code; loginAction sets or clears it before every MFA step.
    await signIn("credentials", { challenge, otp, redirectTo: switchBack?.startsWith("/switch/to?") ? switchBack : home });
  } catch (error) {
    if (isMobileBlocked(error)) return { error: MOBILE_BLOCKED_MESSAGE };
    if (error instanceof AuthError) return { error: "Invalid MFA code." };
    throw error;
  }
  cookieStore.delete(CHALLENGE_COOKIE);
  return {};
}

export async function cancelMfaAction() {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE);
  cookieStore.delete(RETURN_COOKIE);
  redirect("/login");
}

export async function hasPendingMfaChallenge() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(CHALLENGE_COOKIE)?.value);
}
