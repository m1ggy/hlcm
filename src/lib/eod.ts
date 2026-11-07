import { db } from "@/lib/db";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";
import { dayRangeToInstants, toDateInputValue } from "@/lib/time-entries";
import { TASK_CLOSED_STATUSES, type TaskStatusValue } from "@/lib/task-status";
import type { $Enums } from "@/generated/prisma/client";

// End-of-day reports (docs/client-portal-eod-plan.md, Phase C).
//
// One report per person per day — the day in their own timezone. "Start
// day" makes today's draft, pre-filled with their open tasks and whatever
// they timed today; through the day they add what they did per line; "End
// day" submits it: status changes on lines are applied to the tasks
// (audited), lines left empty are dropped, and the report locks. The author
// can reopen it the same day, managers any time.
//
// No Next imports here (tested directly); the actions in
// src/lib/actions/eod.ts dispatch the notifications this returns.

export type EodActor = { userId: string; role: string; timeZone: string };

export type EodNotification = {
  userId: string;
  type: $Enums.NotificationType;
  message: string;
  entityType: string;
  entityId: string;
};

/** Who writes EODs at all: not clients or caregivers (they have visit notes), decided D7. */
export function canWriteEod(role: string | null | undefined) {
  return !!role && role !== "CLIENT" && role !== "CAREGIVER";
}

/** Expected to submit one (reminders, "missing"): the person's setting, else STAFF yes, others no. */
export function eodRequiredFor(user: { role: string; eodRequired: boolean | null }) {
  if (!canWriteEod(user.role)) return false;
  return user.eodRequired ?? user.role === "STAFF";
}

/** Reads every report, reopens any, comments: OWNER / ADMIN / MANAGER (+ DEVELOPER). */
export function canManageEods(role: string | null | undefined) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "DEVELOPER";
}

export function eodToday(timeZone: string, now = new Date()) {
  return toDateInputValue(now, timeZone);
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const OPEN = { notIn: [...TASK_CLOSED_STATUSES] as TaskStatusValue[] };

export const REPORT_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  reopenedBy: { select: { name: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
  comments: { orderBy: { createdAt: "asc" as const }, include: { author: { select: { id: true, name: true } } } },
};

async function loadReport(reportId: string) {
  const report = await db.eodReport.findUnique({ where: { id: reportId }, include: REPORT_INCLUDE });
  if (!report) throw new UserFacingError("Report not found");
  return report;
}

export type EodReportFull = Awaited<ReturnType<typeof loadReport>>;

/** A report the actor may read: their own, or anyone's for managers. */
export async function getReport(actor: EodActor, reportId: string) {
  const report = await loadReport(reportId);
  if (report.userId !== actor.userId && !canManageEods(actor.role)) throw new UserFacingError("Report not found");
  return report;
}

export async function getReportFor(userId: string, day: string) {
  return db.eodReport.findUnique({ where: { userId_reportDate: { userId, reportDate: asDate(day) } }, include: REPORT_INCLUDE });
}

/** The actor's recent reports, newest first. */
export async function listMyReports(userId: string, take = 30) {
  return db.eodReport.findMany({
    where: { userId },
    orderBy: { reportDate: "desc" },
    take,
    select: { id: true, reportDate: true, status: true, submittedAt: true, _count: { select: { items: true, comments: true } } },
  });
}

// Tasks the person can put on their report: assigned to them, created by
// them, or — for managers — any task.
async function assertCanReport(actor: EodActor, taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      label: true,
      status: true,
      createdById: true,
      applicationId: true,
      application: { select: { clientId: true } },
      clientService: { select: { clientId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new UserFacingError("That task no longer exists");
  const mine = task.createdById === actor.userId || task.assignees.some((a) => a.userId === actor.userId);
  if (!mine && !canManageEods(actor.role)) throw new UserFacingError("You can only report on your own tasks");
  return task;
}

const clientOf = (t: { application: { clientId: string } | null; clientService: { clientId: string } | null }) =>
  t.application?.clientId ?? t.clientService?.clientId ?? null;

/**
 * Today's report, started now if there isn't one: a line for every task the
 * person timed today (minutes from the timer) and every open task assigned
 * to them, due soonest first.
 */
export async function startDay(actor: EodActor, now = new Date()) {
  if (!canWriteEod(actor.role)) throw new UserFacingError("End-of-day reports aren't used for your role");
  const day = eodToday(actor.timeZone, now);
  const existing = await getReportFor(actor.userId, day);
  if (existing) return existing;

  const range = dayRangeToInstants(day, day, actor.timeZone);
  const [entries, assigned] = await Promise.all([
    db.taskTimeEntry.findMany({
      where: { userId: actor.userId, taskId: { not: null }, startedAt: { gte: range.from, lte: range.to } },
      select: { taskId: true, startedAt: true, endedAt: true },
    }),
    db.task.findMany({
      where: {
        assignees: { some: { userId: actor.userId } },
        parentTaskId: null,
        archived: false,
        status: OPEN,
        OR: [{ applicationId: null }, { application: { active: true } }],
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true },
    }),
  ]);
  const minutes = new Map<string, number>();
  for (const e of entries) {
    const ms = (e.endedAt ?? now).getTime() - e.startedAt.getTime();
    minutes.set(e.taskId!, (minutes.get(e.taskId!) ?? 0) + Math.max(0, ms));
  }
  const ids = [...new Set([...minutes.keys(), ...assigned.map((t) => t.id)])];
  const tasks = await db.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, label: true, status: true, applicationId: true, application: { select: { clientId: true } }, clientService: { select: { clientId: true } } },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));

  try {
    const report = await db.eodReport.create({
      data: {
        userId: actor.userId,
        reportDate: asDate(day),
        startedAt: now,
        items: {
          create: ids.flatMap((id, i) => {
            const t = byId.get(id);
            if (!t) return [];
            const ms = minutes.get(id);
            const clientId = clientOf(t);
            return [
              {
                taskId: t.id,
                title: t.label,
                applicationId: t.applicationId,
                clientId,
                statusBefore: t.status,
                statusAfter: t.status,
                minutes: ms ? Math.round(ms / 60_000) : null,
                clientVisible: Boolean(clientId),
                sortOrder: i,
              },
            ];
          }),
        },
      },
      include: REPORT_INCLUDE,
    });
    await recordAudit({ entityType: "EodReport", entityId: report.id, action: "start", actorId: actor.userId, newValue: day });
    return report;
  } catch (error) {
    // Started twice at once (two tabs): the other one won.
    const again = await getReportFor(actor.userId, day);
    if (again) return again;
    throw error;
  }
}

export type EodLineInput = {
  id?: string;
  taskId?: string | null;
  title?: string;
  statusAfter?: TaskStatusValue | null;
  workDone?: string;
  internalNote?: string | null;
  minutes?: number | null;
  clientVisible?: boolean;
};

export type EodDraftInput = {
  summary?: string | null;
  blockers?: string | null;
  tomorrowPlan?: string | null;
  items: EodLineInput[];
};

const clean = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

function checkMinutes(m: number | null | undefined) {
  if (m === null || m === undefined) return null;
  if (!Number.isFinite(m) || m < 0 || m > 24 * 60) throw new UserFacingError("Minutes must be between 0 and 1440");
  return Math.round(m);
}

async function ownDraft(actor: EodActor, reportId: string) {
  const report = await db.eodReport.findUnique({ where: { id: reportId }, include: { items: true } });
  if (!report || report.userId !== actor.userId) throw new UserFacingError("Report not found");
  if (report.status !== "DRAFT") throw new UserFacingError("This report was submitted — reopen it to change it");
  return report;
}

/** Saves the draft as a whole (autosave): header fields, and the lines in order (missing ones are removed). */
export async function saveDraft(actor: EodActor, reportId: string, input: EodDraftInput) {
  const report = await ownDraft(actor, reportId);
  const existing = new Map(report.items.map((i) => [i.id, i]));
  const keep = new Set<string>();

  await db.$transaction(async (tx) => {
    for (const [index, line] of input.items.entries()) {
      const fields = {
        workDone: line.workDone?.trim() ?? "",
        internalNote: clean(line.internalNote),
        minutes: checkMinutes(line.minutes),
        clientVisible: Boolean(line.clientVisible),
        sortOrder: index,
      };
      const current = line.id ? existing.get(line.id) : undefined;
      if (current) {
        keep.add(current.id);
        await tx.eodReportItem.update({
          where: { id: current.id },
          data: {
            ...fields,
            // An ad-hoc line's title is its own; a task line keeps the task's.
            ...(!current.taskId && line.title !== undefined && { title: line.title.trim() || current.title }),
            ...(current.taskId && line.statusAfter !== undefined && { statusAfter: line.statusAfter }),
          },
        });
      } else if (line.taskId) {
        const task = await assertCanReport(actor, line.taskId);
        const clientId = clientOf(task);
        const row = await tx.eodReportItem.create({
          data: {
            reportId,
            taskId: task.id,
            title: task.label,
            applicationId: task.applicationId,
            clientId,
            statusBefore: task.status,
            statusAfter: line.statusAfter ?? task.status,
            ...fields,
            clientVisible: line.clientVisible ?? Boolean(clientId),
          },
        });
        keep.add(row.id);
      } else {
        const title = line.title?.trim();
        if (!title) throw new UserFacingError("Give the extra line a short title");
        const row = await tx.eodReportItem.create({ data: { reportId, title, ...fields, clientVisible: false } });
        keep.add(row.id);
      }
    }
    const removed = report.items.filter((i) => !keep.has(i.id)).map((i) => i.id);
    if (removed.length) await tx.eodReportItem.deleteMany({ where: { id: { in: removed } } });
    await tx.eodReport.update({
      where: { id: reportId },
      data: { summary: clean(input.summary), blockers: clean(input.blockers), tomorrowPlan: clean(input.tomorrowPlan) },
    });
  });
  return loadReport(reportId);
}

/**
 * Submits the report: untouched lines (no work written, status unchanged)
 * are dropped, status changes go to the tasks, and the report locks.
 * Returns notifications for the changed tasks' reviewers.
 */
export async function submitReport(actor: EodActor, reportId: string, now = new Date()) {
  const report = await ownDraft(actor, reportId);
  const changed = (i: (typeof report.items)[number]) => Boolean(i.taskId && i.statusAfter && i.statusAfter !== i.statusBefore);
  const untouched = report.items.filter((i) => !i.workDone.trim() && !changed(i));
  const kept = report.items.filter((i) => !untouched.includes(i));
  const missing = kept.find((i) => !i.workDone.trim());
  if (missing) throw new UserFacingError(`Say what you did on "${missing.title}", or remove the line`);
  if (kept.length === 0 && !report.summary) throw new UserFacingError("Add at least one line or a summary before submitting");

  const notifications: EodNotification[] = [];
  for (const item of kept.filter(changed)) {
    const task = await db.task.findUnique({
      where: { id: item.taskId! },
      select: { id: true, label: true, status: true, createdById: true, assignees: { select: { userId: true } }, reviewers: { select: { userId: true } } },
    });
    if (!task) continue; // deleted since — the line still records what was done
    const mine = task.createdById === actor.userId || task.assignees.some((a) => a.userId === actor.userId);
    if (!mine && !canManageEods(actor.role)) throw new UserFacingError(`You can't change the status of "${task.label}"`);
    if (task.status === item.statusAfter) continue;
    await db.task.update({
      where: { id: task.id },
      data: { status: item.statusAfter!, ...(item.statusAfter !== "BLOCKED" && { blockedReason: null }) },
    });
    await recordFieldChanges({
      entityType: "Task",
      entityId: task.id,
      actorId: actor.userId,
      action: "update",
      before: { status: task.status },
      after: { status: item.statusAfter },
    });
    for (const r of task.reviewers) {
      notifications.push({ userId: r.userId, type: "TASK_STATUS_CHANGED", message: `"${task.label}" changed to ${item.statusAfter}`, entityType: "Task", entityId: task.id });
    }
  }

  await db.$transaction(async (tx) => {
    await tx.eodReportItem.deleteMany({ where: { id: { in: untouched.map((i) => i.id) } } });
    await tx.eodReport.update({ where: { id: reportId }, data: { status: "SUBMITTED", submittedAt: now } });
  });
  await recordAudit({ entityType: "EodReport", entityId: reportId, action: "submit", actorId: actor.userId, newValue: `${kept.length} lines` });
  return { report: await loadReport(reportId), notifications };
}

/** Back to draft: the author on the report's own day, managers any time (audited). */
export async function reopenReport(actor: EodActor, reportId: string, now = new Date()) {
  const report = await loadReport(reportId);
  const own = report.userId === actor.userId;
  if (!own && !canManageEods(actor.role)) throw new UserFacingError("Report not found");
  if (report.status !== "SUBMITTED") return report;
  const day = report.reportDate.toISOString().slice(0, 10);
  if (own && !canManageEods(actor.role) && day !== eodToday(actor.timeZone, now)) {
    throw new UserFacingError("You can reopen a report until the end of its day — ask a manager after that");
  }
  await db.eodReport.update({ where: { id: reportId }, data: { status: "DRAFT", reopenedAt: now, reopenedById: actor.userId } });
  await recordAudit({ entityType: "EodReport", entityId: reportId, action: "reopen", actorId: actor.userId, newValue: day });
  return loadReport(reportId);
}

/** Manager feedback, or the author's reply. Notifies the other side. */
export async function addReportComment(actor: EodActor, reportId: string, body: string) {
  const report = await getReport(actor, reportId);
  const text = body.trim();
  if (!text) throw new UserFacingError("Write a comment first");
  await db.eodReportComment.create({ data: { reportId, authorId: actor.userId, body: text } });
  const day = report.reportDate.toISOString().slice(0, 10);
  const notifications: EodNotification[] = [];
  const recipients =
    actor.userId === report.userId
      ? [...new Set(report.comments.map((c) => c.author.id))].filter((id) => id !== actor.userId)
      : [report.userId];
  for (const userId of recipients) {
    notifications.push({
      userId,
      type: "EOD_COMMENTED",
      message: actor.userId === report.userId ? `${report.user.name} replied on their ${day} report` : `New comment on your ${day} report`,
      entityType: "EodReport",
      entityId: reportId,
    });
  }
  return notifications;
}

export type TeamRow = {
  userId: string;
  name: string;
  role: string;
  required: boolean;
  state: "SUBMITTED" | "DRAFT" | "MISSING" | "NOT_EXPECTED";
  report: { id: string; submittedAt: Date | null; lines: number; minutes: number; comments: number } | null;
};

/** Everyone who writes EODs, and where their report for `day` stands. */
export async function teamDay(day: string, clientId?: string | null): Promise<TeamRow[]> {
  const [people, reports] = await Promise.all([
    db.user.findMany({
      where: { active: true, isSupport: false, assignedFromUserId: null, role: { notIn: ["CLIENT", "CAREGIVER"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, eodRequired: true },
    }),
    db.eodReport.findMany({
      where: { reportDate: asDate(day), ...(clientId && { items: { some: { clientId } } }) },
      select: { id: true, userId: true, status: true, submittedAt: true, items: { select: { minutes: true } }, _count: { select: { comments: true } } },
    }),
  ]);
  const byUser = new Map(reports.map((r) => [r.userId, r]));
  return people
    .map((p): TeamRow => {
      const r = byUser.get(p.id);
      const required = eodRequiredFor(p);
      return {
        userId: p.id,
        name: p.name,
        role: p.role,
        required,
        state: r ? r.status : required ? "MISSING" : "NOT_EXPECTED",
        report: r
          ? { id: r.id, submittedAt: r.submittedAt, lines: r.items.length, minutes: r.items.reduce((s, i) => s + (i.minutes ?? 0), 0), comments: r._count.comments }
          : null,
      };
    })
    .filter((row) => !clientId || row.report); // filtering by client: only reports that touch it
}

/** Every line of every submitted report in a date range, for the team export. */
export async function linesForExport(from: string, to: string) {
  return db.eodReportItem.findMany({
    where: { report: { status: "SUBMITTED", reportDate: { gte: asDate(from), lte: asDate(to) } } },
    orderBy: [{ report: { reportDate: "asc" } }, { report: { user: { name: "asc" } } }, { sortOrder: "asc" }],
    include: { report: { select: { reportDate: true, user: { select: { name: true } } } } },
  });
}
