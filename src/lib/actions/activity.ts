"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isTrackedRole, ROLES } from "@/lib/rbac";
import { UserFacingError } from "@/lib/user-facing-error";
import { requireMonitoringViewer } from "@/lib/activity-data";
import { STARTER_RULES } from "@/lib/activity-scoring";
import { revokeDevice } from "@/lib/agent-auth";
import { deleteStoredFileAllVersions } from "@/lib/storage";
import { getEmailBranding } from "@/lib/email";
import { isTrackablePerson } from "@/lib/activity-monitoring";
import type { Role } from "@/generated/prisma/client";

// Admin > Activity mutations. All OWNER/DEVELOPER only and audited.

const TRACKED = ROLES.filter((r) => isTrackedRole(r)) as Role[];

const ruleSchema = z.object({
  matchType: z.enum(["APP", "DOMAIN", "TITLE_CONTAINS"]),
  pattern: z.string().trim().min(1, "Enter what to match").max(200),
  category: z.enum(["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE"]),
  roles: z.array(z.enum(TRACKED as [Role, ...Role[]])).default([]),
  userId: z.string().min(1).nullable(),
  priority: z.coerce.number().int().min(-100).max(100).default(0),
  enabled: z.boolean().default(true),
});

export type RuleInput = z.input<typeof ruleSchema>;

function normalizePattern(matchType: string, pattern: string) {
  if (matchType !== "DOMAIN") return pattern;
  // Accept a pasted URL: keep only the bare domain.
  const host = pattern.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

function revalidate() {
  revalidatePath("/admin/activity", "layout");
  revalidatePath("/time/activity");
}

export async function createProductivityRule(input: RuleInput) {
  const session = await requireMonitoringViewer();
  const data = ruleSchema.parse(input);
  const rule = await db.productivityRule.create({
    data: { ...data, pattern: normalizePattern(data.matchType, data.pattern), roles: data.userId ? [] : data.roles, createdById: session.user.id },
  });
  await recordAudit({ entityType: "ProductivityRule", entityId: rule.id, action: "create", actorId: session.user.id, newValue: { ...data, pattern: rule.pattern } });
  revalidate();
  return { id: rule.id };
}

export async function updateProductivityRule(id: string, input: RuleInput) {
  const session = await requireMonitoringViewer();
  const data = ruleSchema.parse(input);
  const before = await db.productivityRule.findUnique({ where: { id } });
  if (!before) throw new UserFacingError("That rule no longer exists");
  const rule = await db.productivityRule.update({
    where: { id },
    data: { ...data, pattern: normalizePattern(data.matchType, data.pattern), roles: data.userId ? [] : data.roles },
  });
  await recordAudit({
    entityType: "ProductivityRule",
    entityId: id,
    action: "update",
    actorId: session.user.id,
    oldValue: { matchType: before.matchType, pattern: before.pattern, category: before.category, roles: before.roles, userId: before.userId, priority: before.priority, enabled: before.enabled },
    newValue: { ...data, pattern: rule.pattern },
  });
  revalidate();
}

export async function setProductivityRuleEnabled(id: string, enabled: boolean) {
  const session = await requireMonitoringViewer();
  await db.productivityRule.update({ where: { id }, data: { enabled } });
  await recordAudit({ entityType: "ProductivityRule", entityId: id, action: "update", field: "enabled", actorId: session.user.id, oldValue: String(!enabled), newValue: String(enabled) });
  revalidate();
}

export async function deleteProductivityRule(id: string) {
  const session = await requireMonitoringViewer();
  const rule = await db.productivityRule.delete({ where: { id } });
  await recordAudit({ entityType: "ProductivityRule", entityId: id, action: "delete", actorId: session.user.id, oldValue: { matchType: rule.matchType, pattern: rule.pattern, category: rule.category } });
  revalidate();
}

/** Adds the plan's starter rules (section 7) that aren't there yet, plus one for this app's own site. */
export async function loadStarterRules() {
  const session = await requireMonitoringViewer();
  const existing = await db.productivityRule.findMany({ where: { userId: null }, select: { matchType: true, pattern: true } });
  const have = new Set(existing.map((r) => `${r.matchType}:${r.pattern.toLowerCase()}`));

  const starters: (typeof STARTER_RULES)[number][] = [...STARTER_RULES];
  const ownHost = await (async () => {
    try {
      return new URL((await getEmailBranding()).appUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  if (ownHost && ownHost !== "localhost") starters.push({ matchType: "DOMAIN", pattern: ownHost, category: "PRODUCTIVE" });

  const toAdd = starters.filter((r) => !have.has(`${r.matchType}:${r.pattern.toLowerCase()}`));
  if (toAdd.length) {
    await db.productivityRule.createMany({ data: toAdd.map((r) => ({ ...r, createdById: session.user.id })) });
    await recordAudit({ entityType: "ProductivityRule", entityId: "starter", action: "create", actorId: session.user.id, newValue: toAdd.map((r) => `${r.matchType}:${r.pattern}`) });
  }
  revalidate();
  return { added: toAdd.length };
}

export async function revokeAgentDevice(deviceId: string) {
  const session = await requireMonitoringViewer();
  const device = await db.agentDevice.findUnique({ where: { id: deviceId }, select: { id: true, userId: true, revokedAt: true } });
  if (!device) throw new UserFacingError("Device not found");
  if (!device.revokedAt) {
    await revokeDevice(deviceId);
    await recordAudit({ entityType: "AgentDevice", entityId: deviceId, action: "revoke", actorId: session.user.id });
  }
  revalidate();
}

/** Turns app-only clock-in on or off for one person (see time-clock.ts#assertClockOriginAllowed). */
export async function setRequireDesktopClock(userId: string, required: boolean) {
  const session = await requireMonitoringViewer();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true, isSupport: true, assignedFromUserId: true, requireDesktopClock: true },
  });
  if (!user) throw new UserFacingError("User not found");
  if (required && !isTrackablePerson(user)) throw new UserFacingError("This person isn't tracked in this workspace");
  if (user.requireDesktopClock === required) return;
  await db.user.update({ where: { id: userId }, data: { requireDesktopClock: required } });
  await recordAudit({ entityType: "User", entityId: userId, action: "update", field: "requireDesktopClock", actorId: session.user.id, oldValue: String(!required), newValue: String(required) });
  revalidate();
  revalidatePath("/", "layout");
}

/** OWNER/DEVELOPER only, audited. Removes the images from storage and keeps the row as a tombstone. */
export async function deleteScreenshot(id: string) {
  const session = await requireMonitoringViewer();
  const shot = await db.screenshot.findUnique({ where: { id }, select: { id: true, storageKey: true, thumbKey: true, deletedAt: true } });
  if (!shot) throw new UserFacingError("Screenshot not found");
  if (shot.deletedAt) return;
  await db.screenshot.update({ where: { id }, data: { deletedAt: new Date(), deletedById: session.user.id } });
  await Promise.all([deleteStoredFileAllVersions(shot.storageKey), deleteStoredFileAllVersions(shot.thumbKey)]);
  await recordAudit({ entityType: "Screenshot", entityId: id, action: "delete", actorId: session.user.id });
  revalidate();
}
