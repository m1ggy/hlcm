"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { db, currentOrganization, currentWorkspaceTimezone } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { generateMfaSecret, getOtpAuthUrl, verifyTotpToken } from "@/lib/totp";

export async function getAccount() {
  const session = await requireSession();
  const [user, workspaceTimezone] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, mfaEnabled: true, emailNotificationsEnabled: true, timezone: true },
    }),
    currentWorkspaceTimezone(),
  ]);
  // workspaceTimezone: what "not set" falls back to (Organization settings,
  // else DEFAULT_TIMEZONE). workingTimezone: the zone the time clock uses for
  // this user — what the time pages pass down as `accountTimezone`.
  return { ...user, workspaceTimezone, workingTimezone: user.timezone || workspaceTimezone };
}

/** Just getAccount's workingTimezone — for client components that open outside a time page. */
export async function getMyWorkingTimezone() {
  return (await getAccount()).workingTimezone;
}

// null clears back to the workspace default (see getAccount) — validated against the runtime's own IANA database rather than
// a hardcoded list, so it can never drift out of sync with it.
export async function updateTimezone(timezone: string | null) {
  const session = await requireSession();
  if (timezone !== null && !Intl.supportedValuesOf("timeZone").includes(timezone)) {
    throw new Error("Unrecognized timezone");
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { timezone },
  });

  await recordAudit({
    entityType: "User",
    entityId: session.user.id,
    action: "update_timezone",
    actorId: session.user.id,
  });
}

export async function updateEmailNotifications(enabled: boolean) {
  const session = await requireSession();
  await db.user.update({
    where: { id: session.user.id },
    data: { emailNotificationsEnabled: enabled },
  });

  await recordAudit({
    entityType: "User",
    entityId: session.user.id,
    action: "update_email_notifications",
    actorId: session.user.id,
  });
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export async function changePassword(formData: FormData) {
  const session = await requireSession();
  const parsed = changePasswordSchema.parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const currentValid = await bcrypt.compare(parsed.currentPassword, user.passwordHash);
  if (!currentValid) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  await recordAudit({
    entityType: "User",
    entityId: user.id,
    action: "change_password",
    actorId: session.user.id,
  });
}

// Generates a new secret and stores it unconfirmed — mfaEnabled only flips
// to true once the user proves they can produce a valid code from it.
export async function startMfaEnrollment() {
  const session = await requireSession();
  const secret = generateMfaSecret();

  await db.user.update({
    where: { id: session.user.id },
    data: { mfaSecret: secret, mfaEnabled: false },
  });

  const otpauthUrl = getOtpAuthUrl(session.user.email!, secret, (await currentOrganization()).name);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return { secret, qrDataUrl };
}

export async function verifyAndEnableMfa(formData: FormData) {
  const session = await requireSession();
  const code = String(formData.get("code") ?? "");

  const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!user.mfaSecret) {
    throw new Error("Start MFA enrollment first");
  }
  if (!verifyTotpToken(code, user.mfaSecret)) {
    throw new Error("Invalid code — check your authenticator app and try again");
  }

  await db.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });

  await recordAudit({
    entityType: "User",
    entityId: user.id,
    action: "enable_mfa",
    actorId: session.user.id,
  });
}

export async function disableMfa() {
  const session = await requireSession();
  await db.user.update({
    where: { id: session.user.id },
    data: { mfaEnabled: false, mfaSecret: null },
  });

  await recordAudit({
    entityType: "User",
    entityId: session.user.id,
    action: "disable_mfa",
    actorId: session.user.id,
  });
}
