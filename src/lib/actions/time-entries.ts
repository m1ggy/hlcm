"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { TimeClockError, summarizeByUser, type TimeEntryRangeInput } from "@/lib/time-entries";

export async function getMyActiveEntry() {
  const session = await requireSession();
  return prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
}

export async function clockIn() {
  const session = await requireSession();
  const open = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
  });
  if (open) throw new TimeClockError("Already clocked in");

  const entry = await prisma.timeEntry.create({
    data: { userId: session.user.id, clockIn: new Date() },
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: "clock_in",
    actorId: session.user.id,
  });

  revalidatePath("/", "layout");
  return entry;
}

export async function clockOut() {
  const session = await requireSession();
  const open = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  if (!open) throw new TimeClockError("Not clocked in");

  const entry = await prisma.timeEntry.update({
    where: { id: open.id },
    data: { clockOut: new Date() },
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: "clock_out",
    actorId: session.user.id,
  });

  revalidatePath("/", "layout");
  return entry;
}

/** Most recent sessions for the signed-in user — used on their own account page. */
export async function listMyTimeEntries(limit = 25) {
  const session = await requireSession();
  return prisma.timeEntry.findMany({
    where: { userId: session.user.id },
    orderBy: { clockIn: "desc" },
    take: limit,
  });
}

const rangeSchema = z.object({
  userId: z.string().optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/**
 * Entries whose session overlaps [from, to] at all, not just ones that start
 * inside it — a shift clocked in at 11:50pm and out at 12:10am shouldn't
 * vanish from either day's report. Open (still-clocked-in) sessions are
 * included so admins can see someone's on the clock, but are excluded from
 * hour/pay totals by the caller since their duration isn't final yet.
 */
export async function listTimeEntries(input: TimeEntryRangeInput) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { userId, from, to } = rangeSchema.parse(input);

  return prisma.timeEntry.findMany({
    where: {
      ...(userId ? { userId } : {}),
      clockIn: { lte: to },
      OR: [{ clockOut: null }, { clockOut: { gte: from } }],
    },
    include: { user: { select: { id: true, name: true, hourlyRate: true } } },
    orderBy: [{ userId: "asc" }, { clockIn: "asc" }],
  });
}

/** Server action wrapper so client components can preview totals without hitting the PDF route. */
export async function getTimesheetTotals(input: TimeEntryRangeInput) {
  const entries = await listTimeEntries(input);
  return summarizeByUser(entries);
}
