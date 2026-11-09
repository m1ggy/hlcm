import { db } from "@/lib/db";
import { dayRangeToInstants, toDateInputValue, weekRangeForDay } from "@/lib/time-entries";
import { activityWhere, taskWhere, workScope, type WorkTaskStatus } from "@/lib/work";

// The client's weekly summary (docs/workspace-tasks-plan.md, Phase 3),
// computed on read from the append-only activity log, so a past week never
// drifts. It always shows what the CLIENT can see, whoever is looking: it's
// the client's report, and the team should see exactly what the client sees.
// Hours appear only when the workspace shows them to the client (or, marked
// as team-only, to the team).

/** The client-side view, used for every query here. */
function clientScope(orgKind: "FULL" | "TASKS") {
  return workScope({ userId: "", role: "CLIENT", isAssigned: false, orgKind });
}

/** Whether anything the client could see has happened yet — a brand-new workspace's summary explains itself instead. */
export async function summaryHasHistory(orgKind: "FULL" | "TASKS"): Promise<boolean> {
  const scope = clientScope(orgKind);
  const found = await db.workTaskActivity.findFirst({ where: { ...activityWhere(scope), task: taskWhere(scope) }, select: { id: true } });
  return Boolean(found);
}

export type SummaryTaskRef ={ taskId: string; title: string; projectId: string; projectName: string };

export type DaySummary = {
  date: string;
  completed: (SummaryTaskRef & { by: string; at: Date })[];
  progressed: (SummaryTaskRef & { by: string; at: Date; from: string | null; to: string | null; declined: boolean })[];
  added: (SummaryTaskRef & { by: string; at: Date; requested: boolean })[];
  comments: (SummaryTaskRef & { by: string; at: Date; body: string })[];
  files: (SummaryTaskRef & { by: string; at: Date; fileName: string })[];
  /** What the team reported doing, from their end-of-day lines shared with the client (Phase 5). */
  updates: (SummaryTaskRef & { by: string; at: Date; text: string })[];
  hours: number | null;
  note: { body: string; source: "AI" | "HUMAN" | "EDITED"; authorName: string | null } | null;
};

export type WeekSummary = {
  from: string;
  to: string;
  days: DaySummary[];
  totals: { completed: number; progressed: number; added: number; comments: number; files: number; hours: number | null };
  note: { body: string; source: "AI" | "HUMAN" | "EDITED"; authorName: string | null } | null;
};

/** Monday of the week holding `day` (YYYY-MM-DD). */
export function weekStartOf(day: string) {
  return weekRangeForDay(day).from;
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayHasActivity(d: DaySummary) {
  return d.completed.length + d.progressed.length + d.added.length + d.comments.length + d.files.length + d.updates.length > 0;
}

/**
 * The week starting `monday` (YYYY-MM-DD) in the workspace timezone.
 * `withHours`: include tracked hours (only when the workspace shows them to
 * the client, or for the team's own view).
 */
export async function getWeekSummary(opts: { monday: string; timeZone: string; orgKind: "FULL" | "TASKS"; withHours: boolean }): Promise<WeekSummary> {
  const { monday, timeZone, orgKind, withHours } = opts;
  const scope = clientScope(orgKind);
  const sunday = addDays(monday, 6);
  const range = dayRangeToInstants(monday, sunday, timeZone);
  const visibleTask = taskWhere(scope);
  const taskRef = { select: { id: true, title: true, project: { select: { id: true, name: true } } } } as const;

  const [activities, comments, entries, notes] = await Promise.all([
    db.workTaskActivity.findMany({
      where: { occurredAt: { gte: range.from, lte: range.to }, ...activityWhere(scope), task: visibleTask, kind: { in: ["CREATED", "REQUESTED", "STATUS_CHANGED", "FILE_ADDED", "DECLINED", "REPORTED"] } },
      orderBy: { occurredAt: "asc" },
      include: { actor: { select: { name: true } }, task: taskRef },
    }),
    db.workTaskComment.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, visibility: "CLIENT", task: visibleTask },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true } }, task: taskRef },
    }),
    withHours
      ? db.taskTimeEntry.findMany({
          where: { startedAt: { gte: range.from, lte: range.to }, endedAt: { not: null }, workTask: visibleTask },
          select: { startedAt: true, endedAt: true },
        })
      : Promise.resolve([]),
    db.workSummaryNote.findMany({
      where: { OR: [{ period: "DAY", date: { gte: new Date(`${monday}T00:00:00Z`), lte: new Date(`${sunday}T00:00:00Z`) } }, { period: "WEEK", date: new Date(`${monday}T00:00:00Z`) }] },
      include: { author: { select: { name: true } } },
    }),
  ]);

  const days: DaySummary[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(monday, i),
    completed: [],
    progressed: [],
    added: [],
    comments: [],
    files: [],
    updates: [],
    hours: withHours ? 0 : null,
    note: null,
  }));
  const dayOf = (at: Date) => days.find((d) => d.date === toDateInputValue(at, timeZone));
  const ref = (t: { id: string; title: string; project: { id: string; name: string } }): SummaryTaskRef => ({
    taskId: t.id,
    title: t.title,
    projectId: t.project.id,
    projectName: t.project.name,
  });

  for (const a of activities) {
    const day = dayOf(a.occurredAt);
    if (!day) continue;
    const base = { ...ref(a.task), by: a.actor.name, at: a.occurredAt };
    if (a.kind === "CREATED" || a.kind === "REQUESTED") day.added.push({ ...base, requested: a.kind === "REQUESTED" });
    else if (a.kind === "FILE_ADDED") day.files.push({ ...base, fileName: a.to ?? "a file" });
    else if (a.kind === "REPORTED") day.updates.push({ ...base, text: a.to ?? "" });
    else if (a.kind === "DECLINED") day.progressed.push({ ...base, from: a.from, to: "CANCELLED", declined: true });
    else if (a.kind === "STATUS_CHANGED" && (a.to as WorkTaskStatus) === "DONE") day.completed.push(base);
    else if (a.kind === "STATUS_CHANGED") day.progressed.push({ ...base, from: a.from, to: a.to, declined: false });
  }
  // A task finished the same day it moved through other statuses reads as finished.
  for (const day of days) {
    const done = new Set(day.completed.map((c) => c.taskId));
    day.progressed = day.progressed.filter((p) => !done.has(p.taskId));
  }
  for (const c of comments) {
    dayOf(c.createdAt)?.comments.push({ ...ref(c.task), by: c.author.name, at: c.createdAt, body: c.body });
  }
  for (const e of entries) {
    const day = dayOf(e.startedAt);
    if (day && e.endedAt) day.hours = (day.hours ?? 0) + (e.endedAt.getTime() - e.startedAt.getTime()) / 3_600_000;
  }
  for (const n of notes) {
    const note = { body: n.body, source: n.source, authorName: n.author?.name ?? null };
    if (n.period === "DAY") {
      const day = days.find((d) => d.date === n.date.toISOString().slice(0, 10));
      if (day && n.body.trim()) day.note = note;
    }
  }
  const weekNote = notes.find((n) => n.period === "WEEK" && n.body.trim());
  for (const d of days) if (d.hours !== null) d.hours = Math.round(d.hours * 100) / 100;

  const sum = (f: (d: DaySummary) => number) => days.reduce((s, d) => s + f(d), 0);
  return {
    from: monday,
    to: sunday,
    days,
    totals: {
      completed: sum((d) => d.completed.length),
      progressed: sum((d) => d.progressed.length),
      added: sum((d) => d.added.length),
      comments: sum((d) => d.comments.length),
      files: sum((d) => d.files.length),
      hours: withHours ? Math.round(sum((d) => d.hours ?? 0) * 100) / 100 : null,
    },
    note: weekNote ? { body: weekNote.body, source: weekNote.source, authorName: weekNote.author?.name ?? null } : null,
  };
}

/** One line for a day card: "3 tasks finished · 2 moved forward" or null for a quiet day. */
export function dayHeadline(d: DaySummary) {
  const parts: string[] = [];
  if (d.completed.length) parts.push(`${d.completed.length} ${d.completed.length === 1 ? "task" : "tasks"} finished`);
  if (d.progressed.length) parts.push(`${d.progressed.length} moved forward`);
  if (d.added.length) parts.push(`${d.added.length} new`);
  if (d.comments.length) parts.push(`${d.comments.length} ${d.comments.length === 1 ? "comment" : "comments"}`);
  if (d.files.length) parts.push(`${d.files.length} ${d.files.length === 1 ? "file" : "files"}`);
  if (d.updates.length) parts.push(`${d.updates.length} ${d.updates.length === 1 ? "update" : "updates"}`);
  return parts.length ? parts.join(" · ") : null;
}
