"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { currentWorkspaceTimezone, db } from "@/lib/db";
import { requireCareRole } from "@/lib/care-access";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { resolveSignInFields } from "@/lib/user-identity";
import { generatePassword } from "@/lib/generated-password";
import { currentWeekRange, dayRangeToInstants, hoursBetween } from "@/lib/time-entries";

// The Caregivers page (docs/client-care-plan.md): a care agency's caregivers
// — CAREGIVER users of the workspace — added by its office people or our
// assigned staff, who make up their password for them (no invite email;
// many sign in with their phone number). Admins can do the same from the
// Users screen; this is the narrower, caregiver-only version for managers
// and staff.

const OFFICE = ["ADMIN", "MANAGER", "STAFF"] as const;

export type CaregiverRosterRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  clients: { id: string; name: string }[];
  /** Clocked hours Monday–today (the workspace's week), visits and plain shifts alike. */
  hoursThisWeek: number;
  visitsThisWeek: number;
  lastSignInAt: Date | null;
  /** Still on the clock right now. */
  onShift: boolean;
  /** Their standing weekly visits (VisitShift), active clients only. */
  shifts: { id: string; weekday: number; startMinute: number; endMinute: number; client: { id: string; name: string } }[];
  /** Their last few visits (first segments), newest first. */
  recentVisits: { id: string; clockIn: Date; clockOut: Date | null; visitNote: string | null; client: { id: string; name: string } }[];
};

const RECENT_VISITS = 6;

export async function listCaregiverRoster(): Promise<CaregiverRosterRow[]> {
  await requireCareRole([...OFFICE]);
  const tz = await currentWorkspaceTimezone();
  const week = currentWeekRange(tz);
  const range = dayRangeToInstants(week.from, week.to, tz);

  const caregivers = await db.user.findMany({
    where: { role: "CAREGIVER", isSupport: false, assignedFromUserId: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      active: true,
      careRecipientAssignments: {
        where: { careRecipient: { active: true } },
        select: { careRecipient: { select: { id: true, name: true } } },
        orderBy: { careRecipient: { name: "asc" } },
      },
    },
  });
  const ids = caregivers.map((c) => c.id);
  const [entries, logins, shifts, visits] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId: { in: ids }, clockIn: { gte: range.from, lte: range.to } },
      select: { userId: true, clockIn: true, clockOut: true, careRecipientId: true, visitStartId: true },
    }),
    db.loginEvent.groupBy({ by: ["userId"], where: { userId: { in: ids }, success: true }, _max: { createdAt: true } }),
    db.visitShift.findMany({
      where: { caregiverId: { in: ids }, careRecipient: { active: true } },
      select: { id: true, caregiverId: true, weekday: true, startMinute: true, endMinute: true, careRecipient: { select: { id: true, name: true } } },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    }),
    // The last month is plenty to find each caregiver's last few visits.
    db.timeEntry.findMany({
      where: { userId: { in: ids }, visitStartId: null, careRecipientId: { not: null }, clockIn: { gte: new Date(Date.now() - 31 * 24 * 3600_000) } },
      select: { id: true, userId: true, clockIn: true, clockOut: true, visitNote: true, careRecipient: { select: { id: true, name: true } } },
      orderBy: { clockIn: "desc" },
    }),
  ]);
  const now = new Date();
  const lastLogin = new Map(logins.map((l) => [l.userId, l._max.createdAt]));

  return caregivers.map((c) => {
    const mine = entries.filter((e) => e.userId === c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      active: c.active,
      clients: c.careRecipientAssignments.map((a) => a.careRecipient),
      hoursThisWeek: mine.reduce((sum, e) => sum + hoursBetween(e.clockIn, e.clockOut ?? now), 0),
      visitsThisWeek: mine.filter((e) => e.careRecipientId && !e.visitStartId).length,
      lastSignInAt: lastLogin.get(c.id) ?? null,
      onShift: mine.some((e) => !e.clockOut),
      shifts: shifts
        .filter((sh) => sh.caregiverId === c.id)
        .map((sh) => ({ id: sh.id, weekday: sh.weekday, startMinute: sh.startMinute, endMinute: sh.endMinute, client: sh.careRecipient })),
      recentVisits: visits
        .filter((v) => v.userId === c.id && v.careRecipient)
        .slice(0, RECENT_VISITS)
        .map((v) => ({ id: v.id, clockIn: v.clockIn, clockOut: v.clockOut, visitNote: v.visitNote, client: v.careRecipient! })),
    };
  });
}

const caregiverSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().max(40).optional(),
});

/**
 * Adds a caregiver with a made-up password, returned this once for the
 * office to pass on. Signs in with their email, or their phone number when
 * they have no email.
 */
export async function createCaregiver(input: z.input<typeof caregiverSchema>) {
  return toActionResult(async () => {
    const session = await requireCareRole([...OFFICE]);
    const parsed = caregiverSchema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the form");
    const { email, phone } = await resolveSignInFields({ role: "CAREGIVER", email: parsed.data.email, phone: parsed.data.phone });
    if (email && (await db.user.findFirst({ where: { email }, select: { id: true } }))) {
      throw new UserFacingError("Someone in this workspace already has that email");
    }
    const password = generatePassword();
    const user = await db.user.create({
      data: { name: parsed.data.name, email, phone, role: "CAREGIVER", passwordHash: await bcrypt.hash(password, 12) },
      select: { id: true, name: true },
    });
    await recordAudit({ entityType: "User", entityId: user.id, action: "create", actorId: session.user.id, newValue: `Caregiver ${user.name}` });
    revalidatePath("/caregivers");
    revalidatePath("/care-recipients");
    return { id: user.id, name: user.name, signIn: email ?? phone, password };
  });
}

const updateSchema = caregiverSchema.extend({ id: z.string().min(1), active: z.boolean() });

async function findCaregiver(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, phone: true, active: true, role: true, isSupport: true, assignedFromUserId: true },
  });
  if (!user || user.role !== "CAREGIVER" || user.isSupport || user.assignedFromUserId) throw new UserFacingError("Caregiver not found");
  return user;
}

/** Name, email, phone and whether they can still sign in. The password stays — admins change it on the Users screen. */
export async function updateCaregiver(input: z.input<typeof updateSchema>) {
  return toActionResult(async () => {
    const session = await requireCareRole([...OFFICE]);
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the form");
    const before = await findCaregiver(parsed.data.id);
    const { email, phone } = await resolveSignInFields({ userId: before.id, role: "CAREGIVER", email: parsed.data.email, phone: parsed.data.phone });
    if (email) {
      const clash = await db.user.findFirst({ where: { email, id: { not: before.id } }, select: { id: true } });
      if (clash) throw new UserFacingError("Someone in this workspace already has that email");
    }
    const after = { name: parsed.data.name, email, phone, active: parsed.data.active };
    await db.user.update({ where: { id: before.id }, data: after });
    await recordFieldChanges({
      entityType: "User",
      entityId: before.id,
      actorId: session.user.id,
      action: "update",
      before: { name: before.name, email: before.email, phone: before.phone, active: before.active },
      after,
    });
    revalidatePath("/caregivers");
    revalidatePath("/care-recipients");
  });
}
