import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { TimeClockError } from "@/lib/time-entries";
import type { TimeEntrySource } from "@/generated/prisma/client";

// The clock rules (one open session per user, breaks close/reopen sessions,
// visits carry across breaks) shared by the web Server Actions in
// src/lib/actions/time-entries.ts and the desktop tracker's API under
// src/app/api/agent/*. Callers handle auth; everything here takes the
// already-verified userId, so there is exactly one implementation of
// "who is on the clock" no matter where the click came from.

// GPS captured client-side (see TimeClockWidget) around the moment of the
// action — record-only, never validated or required here. A Caregiver with
// no recipient assignments, a denied location permission, or any other
// role entirely just omits this and clocks in/out exactly as before.
export type LocationInput = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  locationError?: string;
};

/** Who opened a session: the web clock (default) or a desktop tracker device. */
export type ClockOrigin = { source: TimeEntrySource; agentDeviceId?: string | null };

const WEB: ClockOrigin = { source: "WEB" };

// Written at clock-out of a visit — trimmed, blank treated as "no note".
// Capped so a pasted wall of text can't bloat every visit-history fetch.
const visitNoteSchema = z.string().trim().max(4000).optional();

/** Stores the note on the visit's first segment — see TimeEntry.visitStartId. */
async function saveVisitNote(entry: { id: string; visitStartId: string | null; careRecipientId: string | null }, note: string | undefined) {
  const visitNote = visitNoteSchema.parse(note);
  if (!entry.careRecipientId || !visitNote) return;
  await db.timeEntry.update({ where: { id: entry.visitStartId ?? entry.id }, data: { visitNote } });
}

/** The session a break interrupted — startBreak closes it at exactly
 * breakStart, so it's the latest entry that ended by then. */
async function entryBeforeBreak(userId: string, breakStart: Date) {
  return db.timeEntry.findFirst({
    where: { userId, clockOut: { lte: breakStart } },
    orderBy: { clockOut: "desc" },
    select: { id: true, careRecipientId: true, visitStartId: true },
  });
}

/**
 * Clocking out ends the day, so it also stops a task timer left running —
 * otherwise a forgotten timer keeps counting overnight. Closed at the same
 * moment as the shift. (Starting a timer clocks you in: startTaskTimer.)
 */
async function stopTaskTimersAtDayEnd(userId: string, at: Date) {
  const open = await db.taskTimeEntry.findMany({ where: { userId, endedAt: null }, select: { id: true } });
  if (open.length === 0) return;
  await db.taskTimeEntry.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { endedAt: at } });
  for (const e of open) {
    await recordAudit({ entityType: "TaskTimeEntry", entityId: e.id, action: "stop_timer_on_clock_out", actorId: userId });
  }
  revalidatePath("/time-tracking");
}

export const DESKTOP_CLOCK_REQUIRED_MESSAGE = "Use the Carenela desktop app to clock in or end a break";

/**
 * Starting tracked time (clock-in, end break) only works from the desktop
 * app once an owner has set requireDesktopClock for this person (Admin >
 * Activity). Clock-out, start break and end day stay allowed on the web as
 * a fallback, since they only stop time. Admin-added manual entries aren't
 * affected.
 */
async function assertClockOriginAllowed(userId: string, origin: ClockOrigin) {
  if (origin.source !== "WEB") return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { requireDesktopClock: true, role: true } });
  if (user?.requireDesktopClock && user.role !== "CAREGIVER" && user.role !== "CLIENT") {
    throw new TimeClockError(DESKTOP_CLOCK_REQUIRED_MESSAGE);
  }
}

export function findOpenEntry(userId: string) {
  return db.timeEntry.findFirst({ where: { userId, clockOut: null }, orderBy: { clockIn: "desc" } });
}

export function findOpenBreak(userId: string) {
  return db.breakEntry.findFirst({ where: { userId, breakEnd: null }, orderBy: { breakStart: "desc" } });
}

export async function clockInFor(
  userId: string,
  input: { careRecipientId?: string } & LocationInput = {},
  origin: ClockOrigin = WEB
) {
  await assertClockOriginAllowed(userId, origin);
  const [open, openBreak] = await Promise.all([findOpenEntry(userId), findOpenBreak(userId)]);
  if (open) throw new TimeClockError("Already clocked in");
  // Desktop app only: resuming from a break is endBreak's job there, so a
  // fresh clock-in mid-break would leave the break dangling. The web clock
  // keeps its long-standing behavior untouched.
  if (openBreak && origin.source === "AGENT") throw new TimeClockError("You're on a break — end the break instead");

  // A visit can only be for someone this Caregiver is actually assigned to
  // — otherwise a crafted request could log (and later bill) time against
  // any recipient by id.
  if (input.careRecipientId) {
    const assigned = await db.careRecipientAssignment.findUnique({
      where: { careRecipientId_caregiverId: { careRecipientId: input.careRecipientId, caregiverId: userId } },
      select: { careRecipient: { select: { active: true } } },
    });
    if (!assigned?.careRecipient.active) throw new TimeClockError("You're not assigned to that recipient");
  }

  const now = new Date();
  const entry = await db.timeEntry.create({
    data: {
      userId,
      clockIn: now,
      careRecipientId: input.careRecipientId,
      clockInLatitude: input.latitude,
      clockInLongitude: input.longitude,
      clockInLocationAccuracy: input.accuracy,
      clockInLocationError: input.locationError,
      source: origin.source,
      agentDeviceId: origin.agentDeviceId ?? null,
      lastHeartbeatAt: origin.source === "AGENT" ? now : null,
    },
  });

  await recordAudit({ entityType: "TimeEntry", entityId: entry.id, action: "clock_in", actorId: userId });
  return entry;
}

/**
 * `at` back-dates the clock-out — only the desktop app's 2-hour no-input
 * clock-out uses it (the session ends when input stopped).
 * It must fall inside the open session and can't be in the future.
 */
export async function clockOutFor(userId: string, input: LocationInput & { visitNote?: string; at?: Date } = {}) {
  const open = await findOpenEntry(userId);
  if (!open) throw new TimeClockError("Not clocked in");

  const now = new Date();
  const clockOut = input.at ?? now;
  if (clockOut < open.clockIn || clockOut > now) throw new TimeClockError("Clock-out time has to fall inside the open session");

  const entry = await db.timeEntry.update({
    where: { id: open.id },
    data: {
      clockOut,
      clockOutLatitude: input.latitude,
      clockOutLongitude: input.longitude,
      clockOutLocationAccuracy: input.accuracy,
      clockOutLocationError: input.locationError,
      // Back-dated by the desktop app's 2-hour no-input clock-out.
      ...(input.at && { autoClosed: true }),
    },
  });
  await saveVisitNote(entry, input.visitNote);
  await stopTaskTimersAtDayEnd(userId, clockOut);

  await recordAudit({
    entityType: "TimeEntry",
    entityId: entry.id,
    action: input.at ? "clock_out_idle" : "clock_out",
    actorId: userId,
  });
  return entry;
}

/**
 * Starts a break: closes the caller's open TimeEntry (a break is unpaid,
 * same as any other gap between sessions already is) and opens a
 * BreakEntry. Requires being clocked in and not already on a break —
 * mirrors clockIn's "already clocked in" guard.
 */
export async function startBreakFor(userId: string) {
  const [openEntry, openBreak] = await Promise.all([findOpenEntry(userId), findOpenBreak(userId)]);
  if (!openEntry) throw new TimeClockError("Not clocked in");
  if (openBreak) throw new TimeClockError("Already on a break");

  const now = new Date();
  const breakEntry = await db.$transaction(async (tx) => {
    await tx.timeEntry.update({ where: { id: openEntry.id }, data: { clockOut: now } });
    return tx.breakEntry.create({ data: { userId, breakStart: now } });
  });

  await recordAudit({ entityType: "BreakEntry", entityId: breakEntry.id, action: "start_break", actorId: userId });
  return breakEntry;
}

/** Ends a break and resumes work: closes the BreakEntry and opens a fresh
 * TimeEntry, credited to whichever clock (web or desktop) resumed it. Use
 * endBreakForDayFor instead if the break turned into being done for the
 * day rather than a return to work. */
export async function endBreakFor(userId: string, origin: ClockOrigin = WEB) {
  await assertClockOriginAllowed(userId, origin);
  const openBreak = await findOpenBreak(userId);
  if (!openBreak) throw new TimeClockError("Not on a break");

  // Resuming after a break mid-visit is still the same visit — carry the
  // recipient over and link back to the visit's first segment, otherwise
  // the rest of the visit would bill to nobody and lose its checklist.
  const beforeBreak = await entryBeforeBreak(userId, openBreak.breakStart);

  const now = new Date();
  const entry = await db.$transaction(async (tx) => {
    await tx.breakEntry.update({ where: { id: openBreak.id }, data: { breakEnd: now } });
    return tx.timeEntry.create({
      data: {
        userId,
        clockIn: now,
        careRecipientId: beforeBreak?.careRecipientId ?? null,
        visitStartId: beforeBreak?.careRecipientId ? (beforeBreak.visitStartId ?? beforeBreak.id) : null,
        source: origin.source,
        agentDeviceId: origin.agentDeviceId ?? null,
        lastHeartbeatAt: origin.source === "AGENT" ? now : null,
      },
    });
  });

  await recordAudit({ entityType: "BreakEntry", entityId: openBreak.id, action: "end_break", actorId: userId });
  return entry;
}

/** Ends a break without resuming work — the break turned into being done
 * for the day. Just closes the BreakEntry; the TimeEntry it started from
 * stays closed, so no new session opens (unlike endBreakFor). */
export async function endBreakForDayFor(userId: string, input: { visitNote?: string } = {}) {
  const openBreak = await findOpenBreak(userId);
  if (!openBreak) throw new TimeClockError("Not on a break");

  const entry = await db.breakEntry.update({ where: { id: openBreak.id }, data: { breakEnd: new Date() } });

  // Ending the day from a break ends the visit too — same note prompt as
  // a normal clock-out.
  const beforeBreak = await entryBeforeBreak(userId, openBreak.breakStart);
  if (beforeBreak) await saveVisitNote(beforeBreak, input.visitNote);
  // And it's a clock-out, so a running task timer stops too.
  await stopTaskTimersAtDayEnd(userId, entry.breakEnd!);

  await recordAudit({ entityType: "BreakEntry", entityId: openBreak.id, action: "end_break_for_day", actorId: userId });
  return entry;
}
