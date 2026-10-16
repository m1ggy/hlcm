"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, ForbiddenError } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { caregiverClientScope } from "@/lib/caregiver-scope";
import { effectiveTimezone, dayRangeToInstants } from "@/lib/time-entries";
import {
  visitIdOf,
  zonedClock,
  shiftStatus,
  parseTimeInput,
  formatWeekdays,
  formatShiftRange,
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  type ShiftStatus,
} from "@/lib/visits";

// Everything a Caregiver does *during* a visit (checklist, concerns) plus
// the staff-side schedule that says when visits should happen. Clock in/out
// itself stays in time-entries.ts — a visit is just a TimeEntry with a
// careRecipientId (see TimeEntry.visitStartId for how breaks fit in).

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

// Same convention as care-recipients.ts: a recipient's history lives on its
// agency Client's audit log when it has one.
function auditTargetFor(recipient: { id: string; clientId: string | null }) {
  return recipient.clientId
    ? { entityType: "Client" as const, entityId: recipient.clientId }
    : { entityType: "CareRecipient" as const, entityId: recipient.id };
}

function revalidateRecipient(clientId: string | null) {
  revalidatePath("/today");
  revalidatePath("/care-recipients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function assertAssigned(careRecipientId: string, caregiverId: string) {
  const assignment = await prisma.careRecipientAssignment.findUnique({
    where: { careRecipientId_caregiverId: { careRecipientId, caregiverId } },
    select: { id: true },
  });
  if (!assignment) throw new ForbiddenError("You're not assigned to this person");
}

/** The caller's open visit (or the visit a current break interrupted),
 * resolved to its first segment. */
async function myCurrentVisit(userId: string) {
  const open = await prisma.timeEntry.findFirst({
    where: { userId, clockOut: null },
    orderBy: { clockIn: "desc" },
    select: { id: true, visitStartId: true, careRecipientId: true },
  });
  if (open) return open.careRecipientId ? { ...open, onBreak: false } : null;

  const openBreak = await prisma.breakEntry.findFirst({
    where: { userId, breakEnd: null },
    select: { breakStart: true },
  });
  if (!openBreak) return null;
  const paused = await prisma.timeEntry.findFirst({
    where: { userId, clockOut: { lte: openBreak.breakStart } },
    orderBy: { clockOut: "desc" },
    select: { id: true, visitStartId: true, careRecipientId: true },
  });
  return paused?.careRecipientId ? { ...paused, onBreak: true } : null;
}

const RECIPIENT_FOR_VISIT = {
  id: true,
  name: true,
  address: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  preferredContactMethod: true,
  contactNotes: true,
  emergencyContactName: true,
  emergencyContactRelationship: true,
  emergencyContactPhone: true,
  careNotes: true,
  visitSchedule: true,
  latitude: true,
  longitude: true,
  client: { select: { id: true, name: true } },
  instructions: { orderBy: { sortOrder: "asc" as const }, select: { id: true, label: true } },
} as const;

/**
 * Everything the Caregiver's Today page needs in one round trip: the visit
 * in progress (with its own checklist state), today's scheduled shifts with
 * a live status, and every assigned recipient so an unscheduled visit can
 * still be started.
 */
export async function getMyToday() {
  const session = await requireRole(["CAREGIVER"]);
  const userId = session.user.id;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
  const timeZone = effectiveTimezone(user.timezone);
  const now = new Date();
  const clock = zonedClock(now, timeZone);
  const dayBounds = dayRangeToInstants(clock.day, clock.day, timeZone);

  const [recipients, shifts, visitSegments, openEntry, openBreak, current] = await Promise.all([
    prisma.careRecipient.findMany({
      where: { active: true, assignments: { some: { caregiverId: userId } } },
      select: RECIPIENT_FOR_VISIT,
      orderBy: { name: "asc" },
    }),
    prisma.visitShift.findMany({
      where: { caregiverId: userId, weekday: clock.weekday, careRecipient: { active: true } },
      orderBy: { startMinute: "asc" },
      select: { id: true, careRecipientId: true, startMinute: true, endMinute: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId,
        careRecipientId: { not: null },
        clockIn: { lte: dayBounds.to },
        OR: [{ clockOut: null }, { clockOut: { gte: dayBounds.from } }],
      },
      select: { id: true, visitStartId: true, careRecipientId: true, clockIn: true, clockOut: true },
      orderBy: { clockIn: "asc" },
    }),
    prisma.timeEntry.findFirst({ where: { userId, clockOut: null }, select: { clockIn: true, careRecipientId: true } }),
    prisma.breakEntry.findFirst({ where: { userId, breakEnd: null }, select: { breakStart: true } }),
    myCurrentVisit(userId),
  ]);

  // Visits as minutes-of-day, grouped per recipient. A break splits a visit
  // into segments; each segment still counts toward its shift on its own.
  const minuteOf = (d: Date) => {
    const c = zonedClock(d, timeZone);
    if (c.day < clock.day) return 0;
    if (c.day > clock.day) return 1440;
    return c.minute;
  };
  const visitsByRecipient = new Map<string, { start: number; end: number | null }[]>();
  for (const seg of visitSegments) {
    const list = visitsByRecipient.get(seg.careRecipientId!) ?? [];
    list.push({ start: minuteOf(seg.clockIn), end: seg.clockOut ? minuteOf(seg.clockOut) : null });
    visitsByRecipient.set(seg.careRecipientId!, list);
  }
  // On a break mid-visit nothing is open, but the visit isn't over either.
  if (current?.onBreak && openBreak) {
    const list = visitsByRecipient.get(current.careRecipientId!) ?? [];
    list.push({ start: minuteOf(openBreak.breakStart), end: null });
    visitsByRecipient.set(current.careRecipientId!, list);
  }

  const recipientById = new Map(recipients.map((r) => [r.id, r]));
  const todayShifts = shifts
    .filter((s) => recipientById.has(s.careRecipientId))
    .map((s) => ({
      ...s,
      recipient: recipientById.get(s.careRecipientId)!,
      status: shiftStatus(s, visitsByRecipient.get(s.careRecipientId) ?? [], clock.minute) as ShiftStatus,
    }));

  let currentVisit = null;
  if (current) {
    const visitId = visitIdOf(current);
    const [first, checks] = await Promise.all([
      prisma.timeEntry.findUniqueOrThrow({ where: { id: visitId }, select: { clockIn: true } }),
      prisma.visitInstructionCheck.findMany({ where: { timeEntryId: visitId }, select: { instructionId: true } }),
    ]);
    const recipient = recipientById.get(current.careRecipientId!) ?? null;
    if (recipient) {
      currentVisit = {
        visitId,
        startedAt: first.clockIn,
        onBreak: current.onBreak,
        recipient,
        checkedIds: checks.map((c) => c.instructionId),
      };
    }
  }

  // Minutes worked on visits today, closed segments plus the open one so far.
  const minutesToday = visitSegments.reduce((sum, seg) => {
    const start = Math.max(seg.clockIn.getTime(), dayBounds.from.getTime());
    const end = Math.min((seg.clockOut ?? now).getTime(), dayBounds.to.getTime());
    return sum + Math.max(0, end - start) / 60_000;
  }, 0);

  return {
    timeZone,
    today: clock.day,
    recipients,
    todayShifts,
    currentVisit,
    // Clocked in with no recipient (office work) — Today still needs to
    // offer a way to clock out of that.
    officeClockIn: openEntry && !openEntry.careRecipientId ? openEntry.clockIn : null,
    breakStartedAt: openBreak?.breakStart ?? null,
    minutesToday: Math.round(minutesToday),
  };
}

/** Just what the header clock's "Who's this visit for?" picker needs —
 * runs on every page load, so kept much lighter than listMyCareRecipients. */
export async function listMyStartableRecipients() {
  const session = await requireRole(["CAREGIVER"]);
  return prisma.careRecipient.findMany({
    where: { active: true, assignments: { some: { caregiverId: session.user.id } } },
    select: { id: true, name: true, address: true, latitude: true, longitude: true },
    orderBy: { name: "asc" },
  });
}

/** The recipient of the caller's visit in progress — including one paused
 * on a break, which the header clock can't tell from the break alone. */
export async function getMyCurrentVisitRecipientId() {
  const session = await requireSession();
  if (session.user.role !== "CAREGIVER") return null;
  const visit = await myCurrentVisit(session.user.id);
  return visit?.careRecipientId ?? null;
}

/** What the End visit dialog summarizes — the checklist state of the visit
 * in progress. Fetched on open so the header clock can show it too. */
export async function getMyVisitWrapUp() {
  const session = await requireRole(["CAREGIVER"]);
  const visit = await myCurrentVisit(session.user.id);
  if (!visit) return null;
  const visitId = visitIdOf(visit);
  const [recipient, checks] = await Promise.all([
    prisma.careRecipient.findUniqueOrThrow({
      where: { id: visit.careRecipientId! },
      select: { name: true, instructions: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true } } },
    }),
    prisma.visitInstructionCheck.findMany({ where: { timeEntryId: visitId }, select: { instructionId: true } }),
  ]);
  const checked = new Set(checks.map((c) => c.instructionId));
  return {
    recipientName: recipient.name,
    total: recipient.instructions.length,
    missed: recipient.instructions.filter((i) => !checked.has(i.id)).map((i) => i.label),
  };
}

/** Tick (or un-tick) one instruction on the caller's visit in progress. */
export async function setVisitInstructionCheck(instructionId: string, checked: boolean) {
  return toActionResult(async () => {
    const session = await requireRole(["CAREGIVER"]);
    const instruction = await prisma.careInstruction.findUniqueOrThrow({
      where: { id: instructionId },
      select: { careRecipientId: true },
    });
    const visit = await myCurrentVisit(session.user.id);
    if (!visit || visit.careRecipientId !== instruction.careRecipientId) {
      throw new UserFacingError("Start a visit with this person to check items off");
    }
    const timeEntryId = visitIdOf(visit);

    if (checked) {
      await prisma.visitInstructionCheck.upsert({
        where: { timeEntryId_instructionId: { timeEntryId, instructionId } },
        create: { timeEntryId, instructionId, checkedById: session.user.id },
        update: {},
      });
    } else {
      await prisma.visitInstructionCheck.deleteMany({ where: { timeEntryId, instructionId } });
    }
    revalidatePath("/today");
  });
}

const incidentSchema = z.object({
  careRecipientId: z.string().min(1),
  category: z.enum(INCIDENT_CATEGORIES),
  urgent: z.boolean(),
  description: z.string().trim().min(1, "Describe what happened").max(4000),
});

/**
 * A Caregiver flags something for the office. Tied to the visit in progress
 * when it's for the same person; notifies every active manager/admin.
 */
export async function reportCareIncident(input: z.input<typeof incidentSchema>) {
  return toActionResult(async () => {
    const session = await requireRole(["CAREGIVER"]);
    const parsed = incidentSchema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the form");
    const data = parsed.data;
    await assertAssigned(data.careRecipientId, session.user.id);

    const [recipient, visit] = await Promise.all([
      prisma.careRecipient.findUniqueOrThrow({
        where: { id: data.careRecipientId },
        select: { id: true, name: true, clientId: true },
      }),
      myCurrentVisit(session.user.id),
    ]);

    const incident = await prisma.careIncident.create({
      data: {
        careRecipientId: data.careRecipientId,
        timeEntryId: visit?.careRecipientId === data.careRecipientId ? visitIdOf(visit) : null,
        category: data.category,
        urgent: data.urgent,
        description: data.description,
        reportedById: session.user.id,
      },
    });

    await recordAudit({
      ...auditTargetFor(recipient),
      action: "report_care_incident",
      actorId: session.user.id,
      newValue: `${INCIDENT_CATEGORY_LABELS[data.category]} — ${recipient.name}`,
    });

    const managers = await prisma.user.findMany({
      where: { active: true, role: { in: ["OWNER", "ADMIN", "MANAGER"] } },
      select: { id: true },
    });
    const message = `${data.urgent ? "URGENT: " : ""}${session.user.name} reported ${INCIDENT_CATEGORY_LABELS[data.category].toLowerCase()} for ${recipient.name}`;
    for (const manager of managers) {
      await notify(
        {
          userId: manager.id,
          type: "CARE_INCIDENT_REPORTED",
          message,
          entityType: recipient.clientId ? "ClientCareRecipients" : "Dashboard",
          entityId: recipient.clientId ?? incident.id,
        },
        session.user.id
      );
    }

    revalidateRecipient(recipient.clientId);
    revalidatePath("/");
  });
}

export async function resolveCareIncident(id: string, resolutionNote: string) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const incident = await prisma.careIncident.findUniqueOrThrow({
      where: { id },
      include: { careRecipient: { select: { id: true, name: true, clientId: true } } },
    });
    if (incident.resolvedAt) throw new UserFacingError("Already resolved");

    await prisma.careIncident.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedById: session.user.id,
        resolutionNote: resolutionNote.trim() || null,
      },
    });

    await recordAudit({
      ...auditTargetFor(incident.careRecipient),
      action: "resolve_care_incident",
      actorId: session.user.id,
      newValue: `${INCIDENT_CATEGORY_LABELS[incident.category]} — ${incident.careRecipient.name}`,
    });

    revalidateRecipient(incident.careRecipient.clientId);
    revalidatePath("/");
  });
}

const shiftSchema = z.object({
  careRecipientId: z.string().min(1),
  caregiverId: z.string().min(1, "Pick a caregiver"),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
  start: z.string(),
  end: z.string(),
});

/** Adds one weekly slot per picked weekday ("Mon/Wed/Fri 9–1" in one go). */
export async function createVisitShifts(input: z.input<typeof shiftSchema>) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const parsed = shiftSchema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "Check the form");
    const data = parsed.data;

    const startMinute = parseTimeInput(data.start);
    // "00:00" as an end time means midnight at the end of the day.
    const rawEnd = parseTimeInput(data.end);
    const endMinute = rawEnd === 0 ? 1440 : rawEnd;
    if (startMinute === null || endMinute === null) throw new UserFacingError("Enter a start and end time");
    if (endMinute <= startMinute) {
      throw new UserFacingError("End time must be after start time — split an overnight visit into two days");
    }

    const [recipient, assignment] = await Promise.all([
      prisma.careRecipient.findUniqueOrThrow({ where: { id: data.careRecipientId }, select: { id: true, name: true, clientId: true } }),
      prisma.careRecipientAssignment.findUnique({
        where: { careRecipientId_caregiverId: { careRecipientId: data.careRecipientId, caregiverId: data.caregiverId } },
        select: { caregiver: { select: { name: true } } },
      }),
    ]);
    if (!assignment) throw new UserFacingError("Assign this caregiver to the recipient first");

    const weekdays = [...new Set(data.weekdays)];
    await prisma.visitShift.createMany({
      data: weekdays.map((weekday) => ({
        careRecipientId: data.careRecipientId,
        caregiverId: data.caregiverId,
        weekday,
        startMinute,
        endMinute,
        createdById: session.user.id,
      })),
    });

    await recordAudit({
      ...auditTargetFor(recipient),
      action: "add_visit_shift",
      actorId: session.user.id,
      newValue: `${assignment.caregiver.name}: ${formatWeekdays(weekdays)} ${formatShiftRange(startMinute, endMinute)}`,
    });

    revalidateRecipient(recipient.clientId);
  });
}

export async function deleteVisitShift(id: string) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const shift = await prisma.visitShift.findUniqueOrThrow({
      where: { id },
      include: {
        careRecipient: { select: { id: true, clientId: true } },
        caregiver: { select: { name: true } },
      },
    });
    await prisma.visitShift.delete({ where: { id } });

    await recordAudit({
      ...auditTargetFor(shift.careRecipient),
      action: "remove_visit_shift",
      actorId: session.user.id,
      oldValue: `${shift.caregiver.name}: ${formatWeekdays([shift.weekday])} ${formatShiftRange(shift.startMinute, shift.endMinute)}`,
    });

    revalidateRecipient(shift.careRecipient.clientId);
  });
}

/**
 * Staff dashboard: today's late/missed visits across every caregiver, plus
 * open concerns. Each caregiver's "today" is read in their own timezone,
 * same as their Today page.
 */
export async function getCareVisitAlerts() {
  await requireRole([...MANAGE_ROLES]);
  const now = new Date();

  const [shifts, openIncidents] = await Promise.all([
    prisma.visitShift.findMany({
      where: { careRecipient: { active: true }, caregiver: { active: true } },
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
        caregiverId: true,
        careRecipientId: true,
        caregiver: { select: { name: true, timezone: true } },
        careRecipient: { select: { name: true, clientId: true } },
      },
    }),
    prisma.careIncident.findMany({
      where: { resolvedAt: null, careRecipient: { active: true } },
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        category: true,
        urgent: true,
        createdAt: true,
        careRecipient: { select: { name: true, clientId: true } },
        reportedBy: { select: { name: true } },
      },
    }),
  ]);

  const todays = shifts.filter((s) => zonedClock(now, effectiveTimezone(s.caregiver.timezone)).weekday === s.weekday);
  if (todays.length === 0) return { problems: [], scheduledToday: 0, openIncidents };

  // Pull every visit segment that could touch today in any caregiver's
  // zone — a ±1 day window around now covers every US zone.
  const segments = await prisma.timeEntry.findMany({
    where: {
      userId: { in: [...new Set(todays.map((s) => s.caregiverId))] },
      careRecipientId: { not: null },
      clockIn: { gte: new Date(now.getTime() - 36 * 3_600_000) },
    },
    select: { userId: true, careRecipientId: true, clockIn: true, clockOut: true },
  });

  const problems: { id: string; status: ShiftStatus; caregiverName: string; recipientName: string; clientId: string | null; startMinute: number; endMinute: number }[] = [];
  for (const s of todays) {
    const tz = effectiveTimezone(s.caregiver.timezone);
    const clock = zonedClock(now, tz);
    const visits = segments
      .filter((v) => v.userId === s.caregiverId && v.careRecipientId === s.careRecipientId)
      .flatMap((v) => {
        const start = zonedClock(v.clockIn, tz);
        const end = v.clockOut ? zonedClock(v.clockOut, tz) : null;
        if (start.day > clock.day || (end && end.day < clock.day)) return [];
        return [{ start: start.day < clock.day ? 0 : start.minute, end: end ? (end.day > clock.day ? 1440 : end.minute) : null }];
      });
    const status = shiftStatus(s, visits, clock.minute);
    if (status === "late" || status === "missed") {
      problems.push({
        id: s.id,
        status,
        caregiverName: s.caregiver.name,
        recipientName: s.careRecipient.name,
        clientId: s.careRecipient.clientId,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      });
    }
  }
  problems.sort((a, b) => a.startMinute - b.startMinute);

  return { problems, scheduledToday: todays.length, openIncidents };
}

/** Whether the signed-in Caregiver has any Clients to show — drives hiding
 * the Clients nav link when it would only ever be empty. */
export async function caregiverHasClients() {
  const session = await requireSession();
  if (session.user.role !== "CAREGIVER") return true;
  const count = await prisma.client.count({ where: { active: true, ...caregiverClientScope(session.user.id) } });
  return count > 0;
}
