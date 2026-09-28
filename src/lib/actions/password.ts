"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { getHostOrg } from "@/lib/tenant";
import { recordAudit } from "@/lib/audit";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { sendPasswordResetEmail } from "@/lib/auth-emails";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// The public (no-session) side of passwords: "forgot password" and the
// /set-password page an invite or reset link lands on. Both are scoped to
// the request host's organization by the tenant client.

const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

const SENT_MESSAGE = "If that email has an account here, a reset link is on its way. It expires in 1 hour.";

/**
 * Always answers the same way, whether or not the email has an account —
 * a different answer would tell anyone which emails are registered.
 */
export async function requestPasswordReset(
  _prev: { message?: string; error?: string } | undefined,
  formData: FormData
): Promise<{ message?: string; error?: string }> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const org = await getHostOrg();
  if (!org || org.status !== "ACTIVE") return { error: "This workspace doesn't exist. Check the address." };

  const ip = await getClientIp();
  if (isRateLimited(`reset:${ip ?? "unknown"}`) || isRateLimited(`reset:${org.id}:${email}`)) {
    return { error: "Too many reset requests — please try again later." };
  }

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, active: true },
    select: { id: true, name: true, email: true },
  });
  if (user) {
    try {
      await sendPasswordResetEmail(user);
      await recordAudit({ entityType: "User", entityId: user.id, action: "request_password_reset", actorId: user.id });
    } catch (error) {
      // Never reveal delivery problems (that would leak which emails exist);
      // the server log has it.
      console.error("Failed to send password reset email:", error);
    }
  }
  return { message: SENT_MESSAGE };
}

const setPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export async function setPasswordWithToken(
  _prev: { error?: string; done?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; done?: boolean }> {
  const parsed = setPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Hash first so a slow bcrypt doesn't widen the window between checking
  // and using the token.
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const token = await consumeAuthToken(parsed.data.token);
  if (!token) return { error: "This link has expired or was already used. Ask for a new one." };

  await db.user.update({ where: { id: token.userId }, data: { passwordHash } });
  await recordAudit({
    entityType: "User",
    entityId: token.userId,
    action: token.kind === "INVITE" ? "accept_invite" : "reset_password",
    actorId: token.userId,
  });
  return { done: true };
}
