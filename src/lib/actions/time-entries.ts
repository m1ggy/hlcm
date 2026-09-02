"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { TimeClockError, summarizeByUser, summarizeByDay, DEFAULT_TIMEZONE, type TimeEntryRangeInput, type BreakDeductionRule } from "@/lib/time-entries";

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

const dailyHoursSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

/** Own hours-per-day chart data — no role gate beyond being signed in, since
 * it's scoped to the caller's own entries (unlike listTimeEntries/
 * listBreakDeductions, which are admin/manager only because they can name
 * any user). Break deductions aren't applied here: the raw session table
 * this backs a chart for doesn't net them out either. */
export async function getMyDailyHours(input: { from: Date; to: Date; timeZone?: string }) {
  const session = await requireSession();
  const { from, to } = dailyHoursSchema.parse(input);
  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      clockIn: { lte: to },
      OR: [{ clockOut: null }, { clockOut: { gte: from } }],
    },
    select: { userId: true, clockIn: true, clockOut: true },
    orderBy: { clockIn: "asc" },
  });
  return summarizeByDay(entries, [], input.timeZone || DEFAULT_TIMEZONE);
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

/**
 * Which TimesheetBreakDeduction rules could apply somewhere in [from, to] —
 * a blanket rule (userId null) always qualifies; a user-specific one only
 * when it matches `userId` (or `userId` is omitted, i.e. an "all users"
 * report, where every rule is relevant). Callers still need to check each
 * entry's own day against a rule's [fromDate, toDate] (see dayInRule in
 * src/lib/time-entries.ts) — this only narrows by range/user up front.
 */
export async function listBreakDeductions(input: { userId?: string; from: Date; to: Date }) {
  await requireRole(["ADMIN", "MANAGER"]);
  return prisma.timesheetBreakDeduction.findMany({
    where: {
      fromDate: { lte: input.to },
      toDate: { gte: input.from },
      ...(input.userId ? { OR: [{ userId: null }, { userId: input.userId }] } : {}),
    },
    include: { user: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
    orderBy: { fromDate: "desc" },
  });
}

/** Server action wrapper so client components can preview totals without hitting the PDF route. */
export async function getTimesheetTotals(input: TimeEntryRangeInput & { timeZone?: string }) {
  const [entries, deductions] = await Promise.all([
    listTimeEntries(input),
    listBreakDeductions(input),
  ]);
  const rules: BreakDeductionRule[] = deductions.map((d) => ({
    userId: d.userId,
    fromDate: d.fromDate,
    toDate: d.toDate,
    minutesPerDay: d.minutesPerDay,
  }));
  return summarizeByUser(entries, rules, input.timeZone || DEFAULT_TIMEZONE);
}

const breakDeductionSchema = z
  .object({
    userId: z.string().optional(),
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
    minutesPerDay: z.coerce.number().int().min(1, "Must be at least 1 minute").max(1440, "Can't exceed 24 hours"),
    note: z.string().optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: "End date must be on or after the start date" });

/**
 * Admin-only: adds a retroactive unpaid-break deduction (e.g. "this pay
 * period should've had a 30-minute lunch deducted each day"). Applied at
 * report/PDF/payout time by summarizeByUser — nothing here touches the
 * underlying TimeEntry rows, so it can be corrected or removed without
 * losing the original clock times.
 */
export async function createBreakDeduction(input: {
  userId?: string;
  fromDate: string;
  toDate: string;
  minutesPerDay: number;
  note?: string;
}) {
  const session = await requireRole(["ADMIN"]);
  const parsed = breakDeductionSchema.parse(input);

  const deduction = await prisma.timesheetBreakDeduction.create({
    data: {
      userId: parsed.userId || null,
      fromDate: parsed.fromDate,
      toDate: parsed.toDate,
      minutesPerDay: parsed.minutesPerDay,
      note: parsed.note || undefined,
      createdById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "TimesheetBreakDeduction",
    entityId: deduction.id,
    action: "create",
    actorId: session.user.id,
    newValue: `${parsed.minutesPerDay}min/day, ${parsed.fromDate.toISOString().slice(0, 10)} – ${parsed.toDate.toISOString().slice(0, 10)}${parsed.userId ? ` (user ${parsed.userId})` : " (all users)"}`,
  });

  revalidatePath("/time");
  return deduction;
}

export async function deleteBreakDeduction(id: string) {
  const session = await requireRole(["ADMIN"]);
  const deduction = await prisma.timesheetBreakDeduction.findUniqueOrThrow({ where: { id } });

  await prisma.timesheetBreakDeduction.delete({ where: { id } });

  await recordAudit({
    entityType: "TimesheetBreakDeduction",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: `${deduction.minutesPerDay}min/day, ${deduction.fromDate.toISOString().slice(0, 10)} – ${deduction.toDate.toISOString().slice(0, 10)}`,
  });

  revalidatePath("/time");
}

const manualEntrySchema = z
  .object({
    userId: z.string().min(1),
    clockIn: z.coerce.date(),
    clockOut: z.coerce.date(),
  })
  .refine((v) => v.clockOut > v.clockIn, { message: "Clock out must be after clock in" });

/**
 * Admin-only: backfills a session someone forgot to clock, or corrects a
 * missed punch — always a completed shift (both ends required), unlike a
 * real clock-in which starts open. Same TimeEntry row a clockIn/clockOut
 * pair would produce, so it flows into totals, PDFs, and payouts exactly
 * the same way.
 */
export async function createManualTimeEntry(input: { userId: string; clockIn: string; clockOut: string }) {
  const session = await requireRole(["ADMIN"]);
  const parsed = manualEntrySchema.parse(input);

  const entry = await prisma.timeEntry.create({
    data: { userId: parsed.userId, clockIn: parsed.clockIn, clockOut: parsed.clockOut },
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: "manual_add",
    actorId: session.user.id,
    newValue: `${parsed.clockIn.toISOString()} – ${parsed.clockOut.toISOString()}`,
  });

  revalidatePath("/time");
  return entry;
}

const updateEntrySchema = z
  .object({
    clockIn: z.coerce.date(),
    clockOut: z.coerce.date().nullable(),
  })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, { message: "Clock out must be after clock in" });

/**
 * Admin-only: corrects an existing entry's times (e.g. someone clocked in
 * late, or fat-fingered a punch). `clockOut: null` re-opens the entry (rare,
 * but lets an admin undo an accidental clock-out) — checked against other
 * open entries for that user so it can't create a second one.
 */
export async function updateTimeEntry(id: string, input: { clockIn: string; clockOut: string | null }) {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });
  const parsed = updateEntrySchema.parse(input);

  if (!parsed.clockOut) {
    const otherOpen = await prisma.timeEntry.findFirst({
      where: { userId: existing.userId, clockOut: null, id: { not: id } },
    });
    if (otherOpen) throw new TimeClockError("This user already has an open entry");
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: { clockIn: parsed.clockIn, clockOut: parsed.clockOut },
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: id,
    action: "edit_time_entry",
    actorId: session.user.id,
    oldValue: `${existing.clockIn.toISOString()} – ${existing.clockOut?.toISOString() ?? "open"}`,
    newValue: `${parsed.clockIn.toISOString()} – ${parsed.clockOut?.toISOString() ?? "open"}`,
  });

  revalidatePath("/time");
  return entry;
}

/** Admin-only: removes a mistaken or duplicate entry (e.g. a double clock-in left dangling open). */
export async function deleteTimeEntry(id: string) {
  const session = await requireRole(["ADMIN"]);
  const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });

  await prisma.timeEntry.delete({ where: { id } });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: `${entry.clockIn.toISOString()} – ${entry.clockOut?.toISOString() ?? "open"}`,
  });

  revalidatePath("/time");
}
