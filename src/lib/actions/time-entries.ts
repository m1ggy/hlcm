"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { toActionResult } from "@/lib/action-result";
import { TimeClockError, summarizeByUser, DEFAULT_TIMEZONE, type TimeEntryRangeInput, type BreakDeductionRule } from "@/lib/time-entries";

export async function getMyActiveEntry() {
  const session = await requireSession();
  return prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
}

/** The signed-in user's in-progress break, or null if they're not on one —
 * same open-row pattern as getMyActiveEntry, mirrored for BreakEntry. */
export async function getMyActiveBreak() {
  const session = await requireSession();
  return prisma.breakEntry.findFirst({
    where: { userId: session.user.id, breakEnd: null },
    orderBy: { breakStart: "desc" },
  });
}

// GPS captured client-side (see TimeClockWidget) around the moment of the
// action — record-only, never validated or required here. A Caregiver with
// no recipient assignments, a denied location permission, or any other
// role entirely just omits this and clocks in/out exactly as before.
type LocationInput = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationError?: string;
};

// Written at clock-out of a visit — trimmed, blank treated as "no note".
// Capped so a pasted wall of text can't bloat every visit-history fetch.
const visitNoteSchema = z.string().trim().max(4000).optional();

/** Stores the note on the visit's first segment — see TimeEntry.visitStartId. */
async function saveVisitNote(entry: { id: string; visitStartId: string | null; careRecipientId: string | null }, note: string | undefined) {
  const visitNote = visitNoteSchema.parse(note);
  if (!entry.careRecipientId || !visitNote) return;
  await prisma.timeEntry.update({ where: { id: entry.visitStartId ?? entry.id }, data: { visitNote } });
}

export async function clockIn(input: { careRecipientId?: string } & LocationInput = {}) {
  const session = await requireSession();
  const open = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
  });
  if (open) throw new TimeClockError("Already clocked in");

  // A visit can only be for someone this Caregiver is actually assigned to
  // — otherwise a crafted request could log (and later bill) time against
  // any recipient by id.
  if (input.careRecipientId) {
    const assigned = await prisma.careRecipientAssignment.findUnique({
      where: { careRecipientId_caregiverId: { careRecipientId: input.careRecipientId, caregiverId: session.user.id } },
      select: { careRecipient: { select: { active: true } } },
    });
    if (!assigned?.careRecipient.active) throw new TimeClockError("You're not assigned to that recipient");
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: session.user.id,
      clockIn: new Date(),
      careRecipientId: input.careRecipientId,
      clockInLatitude: input.latitude,
      clockInLongitude: input.longitude,
      clockInLocationAccuracy: input.accuracy,
      clockInLocationError: input.locationError,
    },
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

export async function clockOut(input: LocationInput & { visitNote?: string } = {}) {
  const session = await requireSession();
  const open = await prisma.timeEntry.findFirst({
    where: { userId: session.user.id, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  if (!open) throw new TimeClockError("Not clocked in");

  const entry = await prisma.timeEntry.update({
    where: { id: open.id },
    data: {
      clockOut: new Date(),
      clockOutLatitude: input.latitude,
      clockOutLongitude: input.longitude,
      clockOutLocationAccuracy: input.accuracy,
      clockOutLocationError: input.locationError,
    },
  });
  await saveVisitNote(entry, input.visitNote);

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: "clock_out",
    actorId: session.user.id,
  });

  revalidatePath("/", "layout");
  return entry;
}

/** The session a break interrupted — startBreak closes it at exactly
 * breakStart, so it's the latest entry that ended by then. */
async function entryBeforeBreak(userId: string, breakStart: Date) {
  return prisma.timeEntry.findFirst({
    where: { userId, clockOut: { lte: breakStart } },
    orderBy: { clockOut: "desc" },
    select: { id: true, careRecipientId: true, visitStartId: true },
  });
}

/**
 * Starts a break: closes the caller's open TimeEntry (a break is unpaid,
 * same as any other gap between sessions already is) and opens a
 * BreakEntry. Requires being clocked in and not already on a break —
 * mirrors clockIn's "already clocked in" guard.
 */
export async function startBreak() {
  const session = await requireSession();
  const [openEntry, openBreak] = await Promise.all([
    prisma.timeEntry.findFirst({ where: { userId: session.user.id, clockOut: null } }),
    prisma.breakEntry.findFirst({ where: { userId: session.user.id, breakEnd: null } }),
  ]);
  if (!openEntry) throw new TimeClockError("Not clocked in");
  if (openBreak) throw new TimeClockError("Already on a break");

  const now = new Date();
  const [, breakEntry] = await prisma.$transaction([
    prisma.timeEntry.update({ where: { id: openEntry.id }, data: { clockOut: now } }),
    prisma.breakEntry.create({ data: { userId: session.user.id, breakStart: now } }),
  ]);

  await recordAudit({
    entityType: "BreakEntry",
    entityId: breakEntry.id,
    action: "start_break",
    actorId: session.user.id,
  });

  revalidatePath("/", "layout");
  return breakEntry;
}

/** Ends a break and resumes work: closes the BreakEntry and opens a fresh
 * TimeEntry. Use endBreakForDay instead if the break turned into being done
 * for the day rather than a return to work. */
export async function endBreak() {
  const session = await requireSession();
  const openBreak = await prisma.breakEntry.findFirst({
    where: { userId: session.user.id, breakEnd: null },
    orderBy: { breakStart: "desc" },
  });
  if (!openBreak) throw new TimeClockError("Not on a break");

  // Resuming after a break mid-visit is still the same visit — carry the
  // recipient over and link back to the visit's first segment, otherwise
  // the rest of the visit would bill to nobody and lose its checklist.
  const beforeBreak = await entryBeforeBreak(session.user.id, openBreak.breakStart);

  const now = new Date();
  const [, entry] = await prisma.$transaction([
    prisma.breakEntry.update({ where: { id: openBreak.id }, data: { breakEnd: now } }),
    prisma.timeEntry.create({
      data: {
        userId: session.user.id,
        clockIn: now,
        careRecipientId: beforeBreak?.careRecipientId ?? null,
        visitStartId: beforeBreak?.careRecipientId ? (beforeBreak.visitStartId ?? beforeBreak.id) : null,
      },
    }),
  ]);

  await recordAudit({
    entityType: "BreakEntry",
    entityId: openBreak.id,
    action: "end_break",
    actorId: session.user.id,
  });

  revalidatePath("/", "layout");
  return entry;
}

/** Ends a break without resuming work — the break turned into being done
 * for the day. Just closes the BreakEntry; the TimeEntry it started from
 * stays closed, so no new session opens (unlike endBreak). */
export async function endBreakForDay(input: { visitNote?: string } = {}) {
  const session = await requireSession();
  const openBreak = await prisma.breakEntry.findFirst({
    where: { userId: session.user.id, breakEnd: null },
    orderBy: { breakStart: "desc" },
  });
  if (!openBreak) throw new TimeClockError("Not on a break");

  const entry = await prisma.breakEntry.update({ where: { id: openBreak.id }, data: { breakEnd: new Date() } });

  // Ending the day from a break ends the visit too — same note prompt as
  // a normal clock-out.
  const beforeBreak = await entryBeforeBreak(session.user.id, openBreak.breakStart);
  if (beforeBreak) await saveVisitNote(beforeBreak, input.visitNote);

  await recordAudit({
    entityType: "BreakEntry",
    entityId: openBreak.id,
    action: "end_break_for_day",
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

const entriesInRangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

/** Own entries for the 24-hour timeline chart (see DailyTimelineChart) — no
 * role gate beyond being signed in, since it's scoped to the caller's own
 * entries (unlike listTimeEntries/listBreakDeductions, which are
 * admin/manager only because they can name any user). Returns raw
 * clockIn/clockOut pairs rather than a summary — the chart needs each
 * session's actual times to draw it as a segment, not just a daily total. */
export async function getMyEntriesInRange(input: { from: Date; to: Date }) {
  const session = await requireSession();
  const { from, to } = entriesInRangeSchema.parse(input);
  return prisma.timeEntry.findMany({
    where: {
      userId: session.user.id,
      clockIn: { lte: to },
      OR: [{ clockOut: null }, { clockOut: { gte: from } }],
    },
    select: { id: true, clockIn: true, clockOut: true },
    orderBy: { clockIn: "asc" },
  });
}

/** Own breaks for the 24-hour timeline chart and break-policy check — same
 * self-scoped shape as getMyEntriesInRange, just against BreakEntry. */
export async function getMyBreaksInRange(input: { from: Date; to: Date }) {
  const session = await requireSession();
  const { from, to } = entriesInRangeSchema.parse(input);
  return prisma.breakEntry.findMany({
    where: {
      userId: session.user.id,
      breakStart: { lte: to },
      OR: [{ breakEnd: null }, { breakEnd: { gte: from } }],
    },
    select: { id: true, breakStart: true, breakEnd: true },
    orderBy: { breakStart: "asc" },
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
    include: {
      user: { select: { id: true, name: true, hourlyRate: true } },
      careRecipient: { select: { id: true, name: true, latitude: true, longitude: true } },
    },
    orderBy: [{ userId: "asc" }, { clockIn: "asc" }],
  });
}

/** Admin/manager view of breaks in [from, to] — same overlap rule and role
 * gate as listTimeEntries, for the Timesheet Report's timeline chart and
 * 30-minute break-policy check. */
export async function listBreakEntries(input: TimeEntryRangeInput) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { userId, from, to } = rangeSchema.parse(input);

  return prisma.breakEntry.findMany({
    where: {
      ...(userId ? { userId } : {}),
      breakStart: { lte: to },
      OR: [{ breakEnd: null }, { breakEnd: { gte: from } }],
    },
    select: { id: true, userId: true, breakStart: true, breakEnd: true, user: { select: { id: true, name: true } } },
    orderBy: [{ userId: "asc" }, { breakStart: "asc" }],
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

  await prisma.timesheetBreakDeduction
    .delete({ where: { id } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That deduction is already gone — someone else may have just removed it" }));

  await recordAudit({
    entityType: "TimesheetBreakDeduction",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: `${deduction.minutesPerDay}min/day, ${deduction.fromDate.toISOString().slice(0, 10)} – ${deduction.toDate.toISOString().slice(0, 10)}`,
  });

  revalidatePath("/time");
}

// --- Admin corrections: shared guards --------------------------------------

// Stands in for "still open" when checking an open session for overlaps.
const FAR_FUTURE = new Date(8.64e15);

/**
 * Refuses a change that would put two pieces of time on top of each other
 * for the same person — otherwise a backfilled shift can silently double
 * someone's hours. `ignore` lists the rows being changed by this same edit.
 */
async function assertNoOverlap(
  userId: string,
  start: Date,
  end: Date,
  ignore: { entryIds?: string[]; breakIds?: string[] } = {}
) {
  const [entry, brk] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: {
        userId,
        id: { notIn: ignore.entryIds ?? [] },
        clockIn: { lt: end },
        OR: [{ clockOut: null }, { clockOut: { gt: start } }],
      },
      select: { id: true },
    }),
    prisma.breakEntry.findFirst({
      where: {
        userId,
        id: { notIn: ignore.breakIds ?? [] },
        breakStart: { lt: end },
        OR: [{ breakEnd: null }, { breakEnd: { gt: start } }],
      },
      select: { id: true },
    }),
  ]);
  if (entry) throw new TimeClockError("This overlaps time already logged for this person");
  if (brk) throw new TimeClockError("This overlaps a break already logged for this person");
}

// How far a session's edge may sit from its break's edge and still count as
// "the session around this break". Punched breaks line up exactly, but
// breaks edited before 2026-10-28 only moved the break row, leaving the
// sessions around it a few minutes off (or overlapping it).
const BREAK_EDGE_TOLERANCE_MS = 15 * 60_000;

/** The work sessions on either side of a break. A break is the gap between
 * them: the session before ends when it starts, the one after starts when
 * it ends (see startBreak / endBreak). Exact matches first; otherwise the
 * nearest session within BREAK_EDGE_TOLERANCE_MS of each edge, including
 * one that overlaps the break, so editing an older break snaps them back. */
async function sessionsAroundBreak(brk: { userId: string; breakStart: Date; breakEnd: Date | null }) {
  const { userId, breakStart, breakEnd } = brk;
  const startMs = breakStart.getTime();
  const [exactBefore, exactAfter] = await Promise.all([
    prisma.timeEntry.findFirst({ where: { userId, clockOut: breakStart } }),
    breakEnd ? prisma.timeEntry.findFirst({ where: { userId, clockIn: breakEnd } }) : null,
  ]);
  const before =
    exactBefore ??
    (await prisma.timeEntry.findFirst({
      where: {
        userId,
        clockIn: { lt: breakStart },
        clockOut: {
          gte: new Date(startMs - BREAK_EDGE_TOLERANCE_MS),
          lte: breakEnd ?? new Date(startMs + BREAK_EDGE_TOLERANCE_MS),
        },
      },
      orderBy: { clockOut: "desc" },
    }));
  const after = !breakEnd
    ? null
    : (exactAfter ??
      (await prisma.timeEntry.findFirst({
        where: {
          userId,
          ...(before ? { id: { not: before.id } } : {}),
          clockIn: { gt: breakStart, lte: new Date(breakEnd.getTime() + BREAK_EDGE_TOLERANCE_MS) },
        },
        orderBy: { clockIn: "asc" },
      })));
  return { before, after };
}

/** Schema parse whose failure message is safe to show (zod's own error is
 * redacted in production like any other throw). */
function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new TimeClockError(result.error.issues[0]?.message ?? "Check the times and try again");
  return result.data;
}

const CLEARED_CLOCK_OUT_LOCATION = {
  clockOutLatitude: null,
  clockOutLongitude: null,
  clockOutLocationAccuracy: null,
  clockOutLocationError: null,
};

function clockOutLocationOf(entry: {
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
  clockOutLocationAccuracy: number | null;
  clockOutLocationError: string | null;
}) {
  return {
    clockOutLatitude: entry.clockOutLatitude,
    clockOutLongitude: entry.clockOutLongitude,
    clockOutLocationAccuracy: entry.clockOutLocationAccuracy,
    clockOutLocationError: entry.clockOutLocationError,
  };
}

const ALREADY_INVOICED = "This visit is already on an invoice — remove it from the invoice first";

const manualEntrySchema = z
  .object({
    userId: z.string().min(1),
    clockIn: z.coerce.date(),
    clockOut: z.coerce.date(),
    // Optional — lets a backfilled visit count toward a Care Recipient's
    // billable hours the same as a real clock-in would (see
    // listUnbilledVisits in src/lib/actions/care-recipients.ts). Omitted
    // for a plain office-work backfill, same as a real clockIn does.
    careRecipientId: z.string().optional(),
    // Optional unpaid break inside the shift — stored the same way a real
    // break is: two sessions with a BreakEntry in the gap.
    breakStart: z.coerce.date().optional(),
    breakEnd: z.coerce.date().optional(),
  })
  .refine((v) => v.clockOut > v.clockIn, { message: "Clock out must be after clock in" })
  .refine((v) => Boolean(v.breakStart) === Boolean(v.breakEnd), { message: "Give the break both a start and an end" })
  .refine((v) => !v.breakStart || !v.breakEnd || v.breakEnd > v.breakStart, { message: "Break end must be after break start" })
  .refine((v) => !v.breakStart || !v.breakEnd || (v.breakStart > v.clockIn && v.breakEnd < v.clockOut), {
    message: "The break has to fall inside the shift",
  });

/**
 * Admin-only: backfills a session someone forgot to clock, or corrects a
 * missed punch — always a completed shift (both ends required), unlike a
 * real clock-in which starts open. Same TimeEntry row a clockIn/clockOut
 * pair would produce, so it flows into totals, PDFs, and payouts exactly
 * the same way — and, with careRecipientId set, into that recipient's
 * billable visits too.
 */
async function createManualTimeEntryImpl(input: {
  userId: string;
  clockIn: string;
  clockOut: string;
  careRecipientId?: string;
  breakStart?: string;
  breakEnd?: string;
}) {
  const session = await requireRole(["ADMIN"]);
  const parsed = parseInput(manualEntrySchema, input);
  await assertNoOverlap(parsed.userId, parsed.clockIn, parsed.clockOut);

  const careRecipientId = parsed.careRecipientId || null;
  const { breakStart, breakEnd } = parsed;
  const entry = await prisma.$transaction(async (tx) => {
    const first = await tx.timeEntry.create({
      data: { userId: parsed.userId, clockIn: parsed.clockIn, clockOut: breakStart ?? parsed.clockOut, careRecipientId },
    });
    if (breakStart && breakEnd) {
      await tx.breakEntry.create({ data: { userId: parsed.userId, breakStart, breakEnd } });
      await tx.timeEntry.create({
        data: {
          userId: parsed.userId,
          clockIn: breakEnd,
          clockOut: parsed.clockOut,
          careRecipientId,
          // Same visit on both sides of the break — see TimeEntry.visitStartId.
          visitStartId: careRecipientId ? first.id : null,
        },
      });
    }
    return first;
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: "manual_add",
    actorId: session.user.id,
    newValue:
      `${parsed.clockIn.toISOString()} – ${parsed.clockOut.toISOString()}` +
      (breakStart && breakEnd ? ` (break ${breakStart.toISOString()} – ${breakEnd.toISOString()})` : ""),
  });

  revalidatePath("/time");
  revalidatePath("/clients");
  return entry;
}

const updateEntrySchema = z
  .object({
    clockIn: z.coerce.date(),
    clockOut: z.coerce.date().nullable(),
    // undefined = leave the visit as it is; null = not a visit.
    careRecipientId: z.string().nullable().optional(),
  })
  .refine((v) => !v.clockOut || v.clockOut > v.clockIn, { message: "Clock out must be after clock in" });

/**
 * Admin-only: corrects an existing entry's times (e.g. someone clocked in
 * late, or fat-fingered a punch). `clockOut: null` re-opens the entry (rare,
 * but lets an admin undo an accidental clock-out) — checked against other
 * open entries for that user so it can't create a second one.
 */
async function updateTimeEntryImpl(
  id: string,
  input: { clockIn: string; clockOut: string | null; careRecipientId?: string | null }
) {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });
  const parsed = parseInput(updateEntrySchema, input);

  if (!parsed.clockOut) {
    const otherOpen = await prisma.timeEntry.findFirst({
      where: { userId: existing.userId, clockOut: null, id: { not: id } },
    });
    if (otherOpen) throw new TimeClockError("This user already has an open entry");
  }
  const timesChanged =
    existing.clockIn.getTime() !== parsed.clockIn.getTime() ||
    (existing.clockOut?.getTime() ?? null) !== (parsed.clockOut?.getTime() ?? null);
  if (timesChanged) {
    if (existing.billedInvoiceId) throw new TimeClockError(ALREADY_INVOICED);
    await assertNoOverlap(existing.userId, parsed.clockIn, parsed.clockOut ?? FAR_FUTURE, { entryIds: [id] });
  }

  // A visit split by breaks is several segments (TimeEntry.visitStartId);
  // changing who it was for applies to every segment so they stay one visit.
  const nextRecipient = parsed.careRecipientId === undefined ? existing.careRecipientId : parsed.careRecipientId || null;
  const recipientChanged = nextRecipient !== existing.careRecipientId;
  const rootId = existing.visitStartId ?? existing.id;
  const chain = recipientChanged
    ? await prisma.timeEntry.findMany({
        where: existing.careRecipientId ? { OR: [{ id: rootId }, { visitStartId: rootId }] } : { id },
        select: { id: true, billedInvoiceId: true },
      })
    : [];
  if (chain.some((e) => e.billedInvoiceId)) throw new TimeClockError(ALREADY_INVOICED);

  const entry = await prisma.$transaction(async (tx) => {
    if (recipientChanged) {
      await tx.timeEntry.updateMany({
        where: { id: { in: chain.map((e) => e.id) } },
        data: nextRecipient ? { careRecipientId: nextRecipient } : { careRecipientId: null, visitStartId: null },
      });
    }
    return tx.timeEntry.update({
      where: { id },
      data: { clockIn: parsed.clockIn, clockOut: parsed.clockOut },
    });
  });

  await recordAudit({
    entityType: "TimeEntry",
    entityId: id,
    action: "edit_time_entry",
    actorId: session.user.id,
    oldValue: `${existing.clockIn.toISOString()} – ${existing.clockOut?.toISOString() ?? "open"}${recipientChanged ? ` (visit ${existing.careRecipientId ?? "none"})` : ""}`,
    newValue: `${parsed.clockIn.toISOString()} – ${parsed.clockOut?.toISOString() ?? "open"}${recipientChanged ? ` (visit ${nextRecipient ?? "none"})` : ""}`,
  });

  revalidatePath("/time");
  if (recipientChanged) revalidatePath("/clients");
  return entry;
}

const addBreakSchema = z
  .object({ breakStart: z.coerce.date(), breakEnd: z.coerce.date() })
  .refine((v) => v.breakEnd > v.breakStart, { message: "Break end must be after break start" });

/**
 * Admin-only: puts an unpaid break inside an existing session. Stored the
 * same way a real break is — the session ends at the break start, a
 * BreakEntry covers the gap, and a new session runs from the break end to
 * the original clock-out — so paid hours drop by the break's length and
 * everything downstream (totals, PDFs, payouts, the break-policy check)
 * treats it like a punched break. A visit stays one visit across the gap.
 */
async function addBreakToEntryImpl(entryId: string, input: { breakStart: string; breakEnd: string }) {
  const session = await requireRole(["ADMIN"]);
  const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id: entryId } });
  const { breakStart, breakEnd } = parseInput(addBreakSchema, input);

  if (!entry.clockOut) throw new TimeClockError("This session is still open — add the break once it's clocked out");
  if (breakStart <= entry.clockIn || breakEnd >= entry.clockOut) {
    throw new TimeClockError("The break has to fall inside the session");
  }
  if (entry.billedInvoiceId) throw new TimeClockError(ALREADY_INVOICED);
  await assertNoOverlap(entry.userId, breakStart, breakEnd, { entryIds: [entry.id] });

  const clockOut = entry.clockOut;
  const [, brk] = await prisma.$transaction([
    prisma.timeEntry.update({ where: { id: entry.id }, data: { clockOut: breakStart, ...CLEARED_CLOCK_OUT_LOCATION } }),
    prisma.breakEntry.create({ data: { userId: entry.userId, breakStart, breakEnd } }),
    prisma.timeEntry.create({
      data: {
        userId: entry.userId,
        clockIn: breakEnd,
        clockOut,
        careRecipientId: entry.careRecipientId,
        visitStartId: entry.careRecipientId ? (entry.visitStartId ?? entry.id) : null,
        // The real clock-out (and where it happened) now belongs to the
        // second half.
        ...clockOutLocationOf(entry),
      },
    }),
  ]);

  await recordAudit({
    entityType: "BreakEntry",
    entityId: brk.id,
    action: "manual_add_break",
    actorId: session.user.id,
    newValue: `${breakStart.toISOString()} – ${breakEnd.toISOString()} (inside session ${entry.id})`,
  });

  revalidatePath("/time");
  if (entry.careRecipientId) revalidatePath("/clients");
  return brk;
}

/** Admin-only: removes a mistaken or duplicate entry (e.g. a double clock-in left dangling open). */
async function deleteTimeEntryImpl(id: string) {
  const session = await requireRole(["ADMIN"]);
  const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id } });

  await prisma.timeEntry
    .delete({ where: { id } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That time entry is already gone — someone else may have just removed it" }));

  await recordAudit({
    entityType: "TimeEntry",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: `${entry.clockIn.toISOString()} – ${entry.clockOut?.toISOString() ?? "open"}`,
  });

  revalidatePath("/time");
}

const updateBreakEntrySchema = z
  .object({
    breakStart: z.coerce.date(),
    breakEnd: z.coerce.date().nullable(),
  })
  .refine((v) => !v.breakEnd || v.breakEnd > v.breakStart, { message: "Break end must be after break start" });

/**
 * Admin-only: corrects an existing break's times — same shape as
 * updateTimeEntry above, just against BreakEntry. `breakEnd: null` re-opens
 * the break (rare, but mirrors letting an admin undo an accidental
 * clock-out), checked against other open breaks for that user so it can't
 * create a second one.
 */
async function updateBreakEntryImpl(id: string, input: { breakStart: string; breakEnd: string | null }) {
  const session = await requireRole(["ADMIN"]);
  const existing = await prisma.breakEntry.findUniqueOrThrow({ where: { id } });
  const parsed = parseInput(updateBreakEntrySchema, input);

  if (!parsed.breakEnd) {
    const otherOpen = await prisma.breakEntry.findFirst({
      where: { userId: existing.userId, breakEnd: null, id: { not: id } },
    });
    if (otherOpen) throw new TimeClockError("This user already has an open break");
  }

  // Moving a break moves the edges of the sessions around it too — before,
  // only the break row changed, so the break and paid hours drifted apart.
  const { before, after } = await sessionsAroundBreak(existing);
  if (after && !parsed.breakEnd) {
    throw new TimeClockError("Work resumed after this break, so it needs an end time");
  }
  if (before && parsed.breakStart <= before.clockIn) {
    throw new TimeClockError("The break would start before the session it follows began");
  }
  if (after && parsed.breakEnd && after.clockOut && parsed.breakEnd >= after.clockOut) {
    throw new TimeClockError("The break would end after the session it leads into ended");
  }
  const moveBefore = Boolean(before && before.clockOut?.getTime() !== parsed.breakStart.getTime());
  const moveAfter = Boolean(after && parsed.breakEnd && after.clockIn.getTime() !== parsed.breakEnd.getTime());
  if ((moveBefore && before?.billedInvoiceId) || (moveAfter && after?.billedInvoiceId)) {
    throw new TimeClockError(ALREADY_INVOICED);
  }
  await assertNoOverlap(
    existing.userId,
    before?.clockIn ?? parsed.breakStart,
    after ? (after.clockOut ?? FAR_FUTURE) : (parsed.breakEnd ?? FAR_FUTURE),
    { entryIds: [before?.id, after?.id].filter((x): x is string => Boolean(x)), breakIds: [id] }
  );

  const [entry] = await prisma.$transaction([
    prisma.breakEntry.update({
      where: { id },
      data: { breakStart: parsed.breakStart, breakEnd: parsed.breakEnd },
    }),
    ...(before && moveBefore ? [prisma.timeEntry.update({ where: { id: before.id }, data: { clockOut: parsed.breakStart } })] : []),
    ...(after && moveAfter && parsed.breakEnd
      ? [prisma.timeEntry.update({ where: { id: after.id }, data: { clockIn: parsed.breakEnd } })]
      : []),
  ]);

  await recordAudit({
    entityType: "BreakEntry",
    entityId: id,
    action: "edit_break_entry",
    actorId: session.user.id,
    oldValue: `${existing.breakStart.toISOString()} – ${existing.breakEnd?.toISOString() ?? "open"}`,
    newValue: `${parsed.breakStart.toISOString()} – ${parsed.breakEnd?.toISOString() ?? "open"}`,
  });

  revalidatePath("/time");
  return entry;
}

/**
 * Admin-only: removes a break and joins the sessions on either side back
 * into one, so the break's time becomes paid again (user's call,
 * 2026-10-28: always merge). Falls back to removing just the break when
 * there's nothing to join — no session on one side, the two sides are
 * different visits, or the later one is already invoiced — and says why.
 */
async function deleteBreakEntryImpl(id: string): Promise<{ merged: boolean; reason?: string }> {
  const session = await requireRole(["ADMIN"]);
  const brk = await prisma.breakEntry.findUniqueOrThrow({ where: { id } });
  const { before, after } = await sessionsAroundBreak(brk);

  let reason: string | undefined;
  if (!before || !after) reason = "there's no session on both sides of it";
  else if (before.careRecipientId !== after.careRecipientId) reason = "the sessions on either side are different visits";
  else if (before.billedInvoiceId || after.billedInvoiceId) reason = "part of that visit is already on an invoice";

  if (before && after && !reason) {
    const visitId = before.careRecipientId ? (before.visitStartId ?? before.id) : null;
    await prisma
      .$transaction([
        prisma.timeEntry.update({
          where: { id: before.id },
          data: { clockOut: after.clockOut, ...clockOutLocationOf(after) },
        }),
        // Later segments of the same visit that pointed at `after` follow
        // it into the merged session; concerns logged against it move too.
        ...(visitId
          ? [
              prisma.timeEntry.updateMany({ where: { visitStartId: after.id }, data: { visitStartId: visitId } }),
              prisma.careIncident.updateMany({ where: { timeEntryId: after.id }, data: { timeEntryId: visitId } }),
            ]
          : []),
        ...(visitId && after.visitNote
          ? [prisma.timeEntry.updateMany({ where: { id: visitId, visitNote: null }, data: { visitNote: after.visitNote } })]
          : []),
        prisma.timeEntry.delete({ where: { id: after.id } }),
        prisma.breakEntry.delete({ where: { id } }),
      ])
      .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That break is already gone — someone else may have just removed it" }));
  } else {
    await prisma.breakEntry
      .delete({ where: { id } })
      .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That break is already gone — someone else may have just removed it" }));
  }

  await recordAudit({
    entityType: "BreakEntry",
    entityId: id,
    action: reason ? "delete" : "delete_and_merge",
    actorId: session.user.id,
    oldValue: `${brk.breakStart.toISOString()} – ${brk.breakEnd?.toISOString() ?? "open"}`,
    newValue: reason ? undefined : `merged sessions ${before!.id} + ${after!.id}`,
  });

  revalidatePath("/time");
  if (before?.careRecipientId) revalidatePath("/clients");
  return reason ? { merged: false, reason } : { merged: true };
}

// --- Exported admin corrections ---------------------------------------------
// Wrapped in toActionResult: in production a thrown message is redacted, so
// "This overlaps…", "already on an invoice" and validation errors come back
// as { ok: false, error } for the dialog to show (see UserFacingError).

export async function createManualTimeEntry(input: Parameters<typeof createManualTimeEntryImpl>[0]) {
  return toActionResult(() => createManualTimeEntryImpl(input));
}

export async function updateTimeEntry(id: string, input: Parameters<typeof updateTimeEntryImpl>[1]) {
  return toActionResult(() => updateTimeEntryImpl(id, input));
}

export async function addBreakToEntry(entryId: string, input: Parameters<typeof addBreakToEntryImpl>[1]) {
  return toActionResult(() => addBreakToEntryImpl(entryId, input));
}

export async function deleteTimeEntry(id: string) {
  return toActionResult(() => deleteTimeEntryImpl(id));
}

export async function updateBreakEntry(id: string, input: Parameters<typeof updateBreakEntryImpl>[1]) {
  return toActionResult(() => updateBreakEntryImpl(id, input));
}

export async function deleteBreakEntry(id: string) {
  return toActionResult(() => deleteBreakEntryImpl(id));
}
