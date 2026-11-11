import { db, runAsTenant } from "@/lib/db";
import { addTaskUpdateLine, type EodActor } from "@/lib/eod";
import { dayRangeToInstants, DEFAULT_TIMEZONE, toDateInputValue } from "@/lib/time-entries";
import { eodHomeOf, type EodHome } from "@/lib/workspace-assignments";
import { actorIn, eodWorkspaces } from "@/lib/work-everywhere";
import { postUpdate, type WorkActor } from "@/lib/work-service";
import type { WorkTaskStatus } from "@/lib/work";
import type { TaskStatusValue } from "@/lib/task-status";
import { UserFacingError } from "@/lib/user-facing-error";

// Updates written on a task (docs/task-updates-plan.md): posted on the task,
// then added to the writer's end-of-day report in their home workspace —
// which may be a different workspace from the task's, when they work in a
// client's workspace through a linked account.

export type TaskUpdateInput = {
  text: string;
  minutes?: number | null;
  shareWithClient?: boolean;
  status?: WorkTaskStatus | null;
  /** Ticked the task's checkbox: finish it. */
  complete?: boolean;
};

const homeTimeZone = (home: EodHome) => home.timeZone || home.org.timezone || DEFAULT_TIMEZONE;
const eodActorOf = (home: EodHome): EodActor => ({ userId: home.userId, role: home.role, timeZone: homeTimeZone(home) });

async function addToReport(home: EodHome | null, line: Parameters<typeof addTaskUpdateLine>[1]) {
  if (!home) return null;
  return runAsTenant(home.org, () => addTaskUpdateLine(eodActorOf(home), line));
}

/**
 * An update on a task in the current workspace, by the signed-in person
 * (`actor` is them here: themselves at home, or their linked account in a
 * client's workspace).
 */
export async function postWorkTaskUpdate(actor: WorkActor, workspace: { id: string; name: string }, taskId: string, input: TaskUpdateInput) {
  const result = await postUpdate(actor, taskId, input);
  const report = await addToReport(await eodHomeOf(actor.userId), {
    kind: "work",
    orgId: workspace.id,
    workspaceName: workspace.name,
    taskId,
    title: result.task.title,
    status: result.statusAfter,
    text: input.text,
    minutes: input.minutes ?? null,
    clientVisible: result.shared,
  });
  return { ...result, addedToReport: Boolean(report), afterSubmit: report?.afterSubmit ?? false };
}

/**
 * The same from the home workspace for a task in one of the person's client
 * workspaces (the Client work page): posted there as their linked account,
 * added to their report here.
 */
export async function postLinkedWorkTaskUpdate(homeUserId: string, orgId: string, taskId: string, input: TaskUpdateInput) {
  const ws = (await eodWorkspaces(homeUserId)).find((w) => w.orgId === orgId);
  if (!ws) throw new UserFacingError("You're no longer assigned to that workspace");
  const result = await runAsTenant({ id: ws.orgId, slug: ws.slug }, () => postUpdate(actorIn(ws), taskId, input));
  const report = await addToReport(await eodHomeOf(homeUserId), {
    kind: "work",
    orgId,
    workspaceName: ws.name,
    taskId,
    title: result.task.title,
    status: result.statusAfter,
    text: input.text,
    minutes: input.minutes ?? null,
    clientVisible: result.shared,
  });
  return { ...result, addedToReport: Boolean(report), afterSubmit: report?.afterSubmit ?? false };
}

/** Today's minutes on the task's timer for `userId`, in the current workspace (the update form's starting value). */
async function timedMinutesToday(userId: string, taskId: string, timeZone: string) {
  const day = toDateInputValue(new Date(), timeZone);
  const range = dayRangeToInstants(day, day, timeZone);
  const entries = await db.taskTimeEntry.findMany({
    where: { userId, workTaskId: taskId, startedAt: { gte: range.from, lte: range.to } },
    select: { startedAt: true, endedAt: true },
  });
  const ms = entries.reduce((sum, e) => sum + Math.max(0, (e.endedAt ?? new Date()).getTime() - e.startedAt.getTime()), 0);
  return ms ? Math.round(ms / 60_000) : null;
}

/** What the update form starts with: today's timer minutes, and whether it goes on a report at all. */
export async function workTaskUpdateDefaults(actorUserId: string, taskId: string) {
  const home = await eodHomeOf(actorUserId);
  return { minutes: await timedMinutesToday(actorUserId, taskId, home ? homeTimeZone(home) : DEFAULT_TIMEZONE), addsToReport: Boolean(home) };
}

export async function linkedWorkTaskUpdateDefaults(homeUserId: string, orgId: string, taskId: string) {
  const ws = (await eodWorkspaces(homeUserId)).find((w) => w.orgId === orgId);
  if (!ws) throw new UserFacingError("You're no longer assigned to that workspace");
  const home = await eodHomeOf(homeUserId);
  const minutes = await runAsTenant({ id: ws.orgId, slug: ws.slug }, () =>
    timedMinutesToday(ws.linkedUserId, taskId, home ? homeTimeZone(home) : DEFAULT_TIMEZONE)
  );
  return { minutes, addsToReport: Boolean(home) };
}

// ---- Licensing tasks (phase 2) ---------------------------------------------------

/**
 * A licensing task ticked done with what was done (the status change itself
 * is made by the caller, through the usual task update): adds it to the
 * person's end-of-day report. Shared lines on a client's task show on the
 * application's progress page, as report lines always have.
 */
export async function reportLicensingTaskUpdate(userId: string, task: { id: string; status: TaskStatusValue; hasClient: boolean }, input: TaskUpdateInput) {
  try {
    const report = await addToReport(await eodHomeOf(userId), {
      kind: "task",
      taskId: task.id,
      status: task.status,
      text: input.text,
      minutes: input.minutes ?? null,
      clientVisible: task.hasClient && input.shareWithClient !== false,
    });
    return { addedToReport: Boolean(report), afterSubmit: report?.afterSubmit ?? false };
  } catch (error) {
    // Someone allowed to edit the task but not to report on it (not theirs, not a manager): the task still closes.
    if (error instanceof UserFacingError) return { addedToReport: false, afterSubmit: false };
    throw error;
  }
}

export async function licensingTaskUpdateDefaults(userId: string, taskId: string) {
  const home = await eodHomeOf(userId);
  const timeZone = home ? homeTimeZone(home) : DEFAULT_TIMEZONE;
  const day = toDateInputValue(new Date(), timeZone);
  const range = dayRangeToInstants(day, day, timeZone);
  const entries = await db.taskTimeEntry.findMany({
    where: { userId, taskId, startedAt: { gte: range.from, lte: range.to } },
    select: { startedAt: true, endedAt: true },
  });
  const ms = entries.reduce((sum, e) => sum + Math.max(0, (e.endedAt ?? new Date()).getTime() - e.startedAt.getTime()), 0);
  return { minutes: ms ? Math.round(ms / 60_000) : null, addsToReport: Boolean(home) };
}
