"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireDeveloper } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const EVENT_SELECT = {
  id: true,
  success: true,
  method: true,
  reason: true,
  deviceType: true,
  browser: true,
  os: true,
  ipAddress: true,
  createdAt: true,
} as const;

/** Each user's most recent successful sign-in plus their mobile-login switch. DEVELOPER only. */
export async function listLoginSummaries() {
  await requireDeveloper();
  const users = await db.user.findMany({
    select: {
      id: true,
      mobileLoginBlocked: true,
      loginEvents: { where: { success: true }, orderBy: { createdAt: "desc" }, take: 1, select: EVENT_SELECT },
    },
  });
  return Object.fromEntries(
    users.map((u) => [u.id, { mobileLoginBlocked: u.mobileLoginBlocked, lastLogin: u.loginEvents[0] ?? null }])
  );
}

export type LoginSummary = Awaited<ReturnType<typeof listLoginSummaries>>[string];

/** Last 25 sign-ins (including refused mobile ones) for one user. DEVELOPER only. */
export async function getLoginHistory(userId: string) {
  await requireDeveloper();
  const id = z.string().min(1).parse(userId);
  return db.loginEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: EVENT_SELECT,
  });
}

export type LoginHistoryEvent = Awaited<ReturnType<typeof getLoginHistory>>[number];

const setSchema = z.object({ userId: z.string().min(1), blocked: z.boolean() });

/** Turn phone/tablet sign-in off or on for one user. DEVELOPER only. */
export async function setMobileLoginBlocked(input: z.infer<typeof setSchema>) {
  const session = await requireDeveloper();
  const parsed = setSchema.parse(input);

  const before = await db.user.findUniqueOrThrow({
    where: { id: parsed.userId },
    select: { mobileLoginBlocked: true },
  });
  if (before.mobileLoginBlocked === parsed.blocked) return;

  await db.user.update({ where: { id: parsed.userId }, data: { mobileLoginBlocked: parsed.blocked } });
  await recordAudit({
    entityType: "User",
    entityId: parsed.userId,
    action: "update",
    actorId: session.user.id,
    field: "mobileLoginBlocked",
    oldValue: before.mobileLoginBlocked,
    newValue: parsed.blocked,
  });

  revalidatePath("/admin/users");
}
