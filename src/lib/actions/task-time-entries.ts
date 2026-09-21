"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, isManagement } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { TaskTimeError } from "@/lib/task-time-entries";

const entryInclude = {
  user: { select: { id: true, name: true, hourlyRate: true } },
  task: { select: { id: true, label: true, estimatedHours: true, application: { select: { id: true, name: true } } } },
} as const;

/** The signed-in user's running timer, or null — for the nav widget's
 * page-load hydration, same shape as getMyActiveEntry in time-entries.ts. */
export async function getMyOpenTaskTimer() {
  const session = await requireSession();
  return prisma.taskTimeEntry.findFirst({
    where: { userId: session.user.id, endedAt: null },
    include: entryInclude,
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Starts a timer against a task (or the "Internal/no task" bucket when
 * taskId is omitted). Only one running timer per person — Everhour's own
 * rule — so any of the caller's open entries are closed first rather than
 * rejecting the new start; switching tasks is just "start the next one".
 */
export async function startTaskTimer(input: { taskId?: string; description?: string } = {}) {
  const session = await requireSession();
  const now = new Date();

  await prisma.taskTimeEntry.updateMany({
    where: { userId: session.user.id, endedAt: null },
    data: { endedAt: now },
  });

  const entry = await prisma.taskTimeEntry.create({
    data: {
      userId: session.user.id,
      taskId: input.taskId || undefined,
      description: input.description?.trim() || undefined,
      startedAt: now,
      source: "TIMER",
    },
    include: entryInclude,
  });

  await recordAudit({ entityType: "TaskTimeEntry", entityId: entry.id, action: "start_timer", actorId: session.user.id });
  revalidatePath("/", "layout");
  return entry;
}

/** Stops the caller's running timer. Throws if nothing is running — mirrors
 * clockOut's "not clocked in" guard in time-entries.ts. */
export async function stopTaskTimer() {
  const session = await requireSession();
  const open = await prisma.taskTimeEntry.findFirst({
    where: { userId: session.user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) throw new TaskTimeError("No timer is running");

  const entry = await prisma.taskTimeEntry.update({ where: { id: open.id }, data: { endedAt: new Date() }, include: entryInclude });

  await recordAudit({ entityType: "TaskTimeEntry", entityId: entry.id, action: "stop_timer", actorId: session.user.id });
  revalidatePath("/", "layout");
  revalidatePath("/time-tracking");
  return entry;
}

/** Sets (or clears) the note on the caller's running timer — lets someone
 * start with one click and say what they're actually doing afterwards. */
export async function setOpenTaskTimerDescription(description: string) {
  const session = await requireSession();
  const open = await prisma.taskTimeEntry.findFirst({
    where: { userId: session.user.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) throw new TaskTimeError("No timer is running");
  await prisma.taskTimeEntry.update({ where: { id: open.id }, data: { description: description.trim() || null } });
  revalidatePath("/time-tracking");
}

/**
 * The caller's most recently tracked tasks, newest first, one row per task
 * — feeds the nav timer's default/ordering and the Time tracking page's
 * "Quick start" row. Archived tasks and tasks on inactive cases are
 * skipped (nothing useful to resume there).
 */
export async function listMyRecentTimerTasks(limit = 5) {
  const session = await requireSession();
  const rows = await prisma.taskTimeEntry.findMany({
    where: {
      userId: session.user.id,
      taskId: { not: null },
      task: { archived: false, OR: [{ applicationId: null }, { application: { active: true } }] },
    },
    orderBy: { startedAt: "desc" },
    take: 60, // plenty to find `limit` distinct tasks without scanning history
    select: { task: { select: { id: true, label: true, application: { select: { name: true } } } } },
  });
  const seen = new Set<string>();
  const out: { id: string; label: string; applicationName: string | null }[] = [];
  for (const r of rows) {
    if (!r.task || seen.has(r.task.id)) continue;
    seen.add(r.task.id);
    out.push({ id: r.task.id, label: r.task.label, applicationName: r.task.application?.name ?? null });
    if (out.length >= limit) break;
  }
  return out;
}

const manualEntrySchema = z
  .object({
    // Only ADMIN/MANAGER may set this to someone other than themselves —
    // enforced below, not by the schema (schema just shapes the input).
    userId: z.string().optional(),
    taskId: z.string().optional(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    description: z.string().optional(),
    billable: z.boolean().default(true),
  })
  .refine((v) => v.endedAt > v.startedAt, { message: "End time must be after start time" });

/**
 * Logs a completed block of work time — self-service, unlike the
 * attendance clock's admin-only createManualTimeEntry: staff are expected
 * to fill in their own case work after the fact (forgot to start the
 * timer, worked offline, etc.), same as Everhour's own manual-entry model.
 * An ADMIN/MANAGER may pass a different userId to log/correct time on
 * someone else's behalf.
 */
export async function addManualTaskTimeEntry(input: {
  userId?: string;
  taskId?: string;
  startedAt: string;
  endedAt: string;
  description?: string;
  billable?: boolean;
}) {
  const session = await requireSession();
  const parsed = manualEntrySchema.parse(input);

  const userId = parsed.userId && parsed.userId !== session.user.id ? parsed.userId : session.user.id;
  if (userId !== session.user.id && !isManagement(session.user.role)) {
    throw new TaskTimeError("Only an admin or manager can log time for someone else");
  }

  const entry = await prisma.taskTimeEntry.create({
    data: {
      userId,
      taskId: parsed.taskId || undefined,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      description: parsed.description?.trim() || undefined,
      billable: parsed.billable,
      source: "MANUAL",
    },
    include: entryInclude,
  });

  await recordAudit({
    entityType: "TaskTimeEntry",
    entityId: entry.id,
    action: "manual_add",
    actorId: session.user.id,
    newValue: `${parsed.startedAt.toISOString()} – ${parsed.endedAt.toISOString()}`,
  });

  revalidatePath("/time-tracking");
  return entry;
}

const updateEntrySchema = z
  .object({
    taskId: z.string().nullable().optional(),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date(),
    description: z.string().optional(),
    billable: z.boolean(),
  })
  .refine((v) => v.endedAt > v.startedAt, { message: "End time must be after start time" });

async function assertCanEditEntry(entryId: string, actorId: string, actorRole: string) {
  const entry = await prisma.taskTimeEntry.findUniqueOrThrow({ where: { id: entryId } });
  if (entry.billedInvoiceId) throw new TaskTimeError("This entry has already been billed and can no longer be edited");
  if (entry.userId !== actorId && !isManagement(actorRole)) throw new TaskTimeError("You can only edit your own time entries");
  return entry;
}

/** Corrects an existing entry — own entries always editable (until billed),
 * anyone else's requires ADMIN/MANAGER, same ownership rule as
 * assertCanEditEntry above. */
export async function updateTaskTimeEntry(
  id: string,
  input: { taskId?: string | null; startedAt: string; endedAt: string; description?: string; billable: boolean }
) {
  const session = await requireSession();
  const existing = await assertCanEditEntry(id, session.user.id, session.user.role);
  const parsed = updateEntrySchema.parse(input);

  const entry = await prisma.taskTimeEntry.update({
    where: { id },
    data: {
      taskId: parsed.taskId ?? null,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      description: parsed.description?.trim() || null,
      billable: parsed.billable,
    },
    include: entryInclude,
  });

  await recordAudit({
    entityType: "TaskTimeEntry",
    entityId: id,
    action: "edit",
    actorId: session.user.id,
    oldValue: `${existing.startedAt.toISOString()} – ${existing.endedAt?.toISOString() ?? "open"}`,
    newValue: `${parsed.startedAt.toISOString()} – ${parsed.endedAt.toISOString()}`,
  });

  revalidatePath("/time-tracking");
  return entry;
}

/** Removes a mistaken/duplicate entry — same ownership rule as update, and
 * same "already billed" guard (an invoiced entry is a financial record now,
 * not just a log). */
export async function deleteTaskTimeEntry(id: string) {
  const session = await requireSession();
  const entry = await assertCanEditEntry(id, session.user.id, session.user.role);

  await prisma.taskTimeEntry
    .delete({ where: { id } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That time entry is already gone — someone else may have just removed it" }));

  await recordAudit({
    entityType: "TaskTimeEntry",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: `${entry.startedAt.toISOString()} – ${entry.endedAt?.toISOString() ?? "open"}`,
  });

  revalidatePath("/time-tracking");
}

const rangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

/** The signed-in user's own entries overlapping [from, to] — feeds their
 * own weekly grid and list report. Open entries are included (so a running
 * timer shows up) but contribute 0 hours until stopped, same "not final
 * yet" rule as the attendance clock. */
export async function listMyTaskTimeEntries(input: { from: Date; to: Date }) {
  const session = await requireSession();
  const { from, to } = rangeSchema.parse(input);
  return prisma.taskTimeEntry.findMany({
    where: {
      userId: session.user.id,
      startedAt: { lte: to },
      OR: [{ endedAt: null }, { endedAt: { gte: from } }],
    },
    include: entryInclude,
    orderBy: { startedAt: "asc" },
  });
}

const teamRangeSchema = z.object({ userId: z.string().optional(), from: z.coerce.date(), to: z.coerce.date() });

/** ADMIN/MANAGER view across every user (or one, via userId) — same overlap
 * rule and role gate as listTimeEntries in time-entries.ts. */
export async function listTeamTaskTimeEntries(input: { userId?: string; from: Date; to: Date }) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { userId, from, to } = teamRangeSchema.parse(input);
  return prisma.taskTimeEntry.findMany({
    where: {
      ...(userId ? { userId } : {}),
      startedAt: { lte: to },
      OR: [{ endedAt: null }, { endedAt: { gte: from } }],
    },
    include: entryInclude,
    orderBy: [{ userId: "asc" }, { startedAt: "asc" }],
  });
}

/**
 * Every currently-running timer across the team — a manager's "who's
 * actively on the clock, and on what" glance. Read-only: there's no
 * admin-stop-for-someone-else action, this is purely informational (the
 * person themselves is the only one who can stop their own timer).
 */
export async function listOpenTeamTimers() {
  await requireRole(["ADMIN", "MANAGER"]);
  const entries = await prisma.taskTimeEntry.findMany({
    where: { endedAt: null },
    include: entryInclude,
    orderBy: { startedAt: "asc" },
  });
  // Elapsed hours computed here, not in the page component that renders
  // this — a Server Component's render must stay pure (no Date.now()
  // inside it), same reasoning as listMyTasks' own isOverdue computation.
  const now = Date.now();
  return entries.map((e) => ({ ...e, runningHours: (now - e.startedAt.getTime()) / 3_600_000 }));
}

/**
 * Total tracked hours for one Task (across every contributor, open timers
 * excluded since they're not final) plus its estimatedHours budget — the
 * "Time tracked: Xh / Yh estimated" line on TaskDetailDialog. Hours only,
 * no $ breakdown: a task's contributors can differ in hourlyRate, and
 * showing $ here would leak payroll-rate-derived numbers to whoever can
 * open this task (not everyone who can see a task is ADMIN/MANAGER).
 */
export async function getTaskTimeSummary(taskId: string) {
  await requireSession();
  const [entries, task] = await Promise.all([
    prisma.taskTimeEntry.findMany({ where: { taskId, endedAt: { not: null } }, select: { startedAt: true, endedAt: true } }),
    prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { estimatedHours: true } }),
  ]);
  const hours = entries.reduce((sum, e) => sum + (e.endedAt!.getTime() - e.startedAt.getTime()) / 3_600_000, 0);
  return { hours, estimatedHours: task.estimatedHours };
}

/**
 * Unbilled, completed task time for one Application — mirrors
 * listUnbilledVisits in src/lib/actions/care-recipients.ts exactly, just
 * scoped through the Application's own Tasks instead of a CareRecipient.
 * Feeds the "Bill tracked time" action on the Invoices page.
 */
export async function listUnbilledTaskTime(applicationId: string) {
  // requireRole's own ACCOUNTANT-inherits-ADMIN rule (src/lib/rbac.ts) covers
  // Accounting without listing it explicitly, same as every other
  // ADMIN-gated action in invoices.ts.
  await requireRole(["ADMIN", "MANAGER"]);
  return prisma.taskTimeEntry.findMany({
    where: {
      task: { applicationId },
      endedAt: { not: null },
      billedInvoiceId: null,
    },
    include: entryInclude,
    orderBy: { startedAt: "asc" },
  });
}
