import { listLinkedWorkspaces, type LinkedWorkspace } from "@/lib/workspace-assignments";
import { runAsTenant, tenantDb } from "@/lib/db";
import { UserFacingError } from "@/lib/user-facing-error";
import { dayRangeToInstants } from "@/lib/time-entries";
import { OPEN_WORK_STATUSES, workScope, type WorkTaskStatus } from "@/lib/work";
import { recordReport, updateTask, type WorkActor } from "@/lib/work-service";

// A person's work in the client workspaces they're assigned to, read from
// their home workspace (docs/workspace-tasks-plan.md, Phase 5): "My work
// everywhere" and end-of-day lines on those tasks.
//
// Assignments are a platform table (system client). Each workspace's tasks
// are read with that workspace's own tenant client, as the person's linked
// account there — never across workspaces in one query.

export type { LinkedWorkspace };

/** The client workspaces `homeUserId` is actively assigned to. */
export const linkedWorkspaces = (homeUserId: string): Promise<LinkedWorkspace[]> => listLinkedWorkspaces(homeUserId);

async function linkedWorkspace(homeUserId: string, orgId: string) {
  const ws = (await linkedWorkspaces(homeUserId)).find(
    (w) => w.orgId === orgId,
  );
  if (!ws)
    throw new UserFacingError("You're no longer assigned to that workspace");
  return ws;
}

const OPEN = { in: OPEN_WORK_STATUSES };
const taskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  clientVisible: true,
  project: { select: { id: true, name: true, color: true } },
  parent: { select: { title: true } },
} as const;

/** Open tasks assigned to me in every client workspace, soonest due first. */
export async function listMyWorkEverywhere(homeUserId: string) {
  const out = [];
  for (const ws of await linkedWorkspaces(homeUserId)) {
    const tasks = await tenantDb(ws.orgId).workTask.findMany({
      where: {
        assignees: { some: { userId: ws.linkedUserId } },
        status: OPEN,
        project: { status: { not: "ARCHIVED" } },
      },
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
      select: taskSelect,
    });
    out.push({ workspace: { slug: ws.slug, name: ws.name }, tasks });
  }
  return out;
}

export type WorkLineSeed = {
  orgId: string;
  workspaceName: string;
  taskId: string;
  title: string;
  status: WorkTaskStatus;
  clientVisible: boolean;
  minutes: number | null;
};

/**
 * What an EOD started today should list from client workspaces: tasks the
 * person timed today (with minutes), then their open assigned tasks.
 */
export async function workTasksForDay(
  homeUserId: string,
  day: string,
  timeZone: string,
  now = new Date(),
): Promise<WorkLineSeed[]> {
  const range = dayRangeToInstants(day, day, timeZone);
  const out: WorkLineSeed[] = [];
  for (const ws of await linkedWorkspaces(homeUserId)) {
    const t = tenantDb(ws.orgId);
    const [entries, assigned] = await Promise.all([
      t.taskTimeEntry.findMany({
        where: {
          userId: ws.linkedUserId,
          workTaskId: { not: null },
          startedAt: { gte: range.from, lte: range.to },
        },
        select: { workTaskId: true, startedAt: true, endedAt: true },
      }),
      t.workTask.findMany({
        where: {
          assignees: { some: { userId: ws.linkedUserId } },
          status: OPEN,
          parentId: null,
          project: { status: { not: "ARCHIVED" } },
        },
        orderBy: [
          { dueDate: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
        select: { id: true },
      }),
    ]);
    const ms = new Map<string, number>();
    for (const e of entries)
      ms.set(
        e.workTaskId!,
        (ms.get(e.workTaskId!) ?? 0) +
          Math.max(0, (e.endedAt ?? now).getTime() - e.startedAt.getTime()),
      );
    const ids = [...new Set([...ms.keys(), ...assigned.map((a) => a.id)])];
    const tasks = new Map(
      (
        await t.workTask.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, status: true, clientVisible: true },
        })
      ).map((x) => [x.id, x]),
    );
    for (const id of ids) {
      const task = tasks.get(id);
      if (!task) continue;
      const m = ms.get(id);
      out.push({
        orgId: ws.orgId,
        workspaceName: ws.name,
        taskId: id,
        title: task.title,
        status: task.status as WorkTaskStatus,
        clientVisible: task.clientVisible,
        minutes: m ? Math.round(m / 60_000) : null,
      });
    }
  }
  return out;
}

/** Tasks the person could add to their report: open ones assigned to them in each workspace. */
export async function workTaskOptions(homeUserId: string) {
  const groups = await listMyWorkEverywhere(homeUserId);
  const spaces = await linkedWorkspaces(homeUserId);
  return groups.flatMap((g) => {
    const orgId = spaces.find((s) => s.slug === g.workspace.slug)!.orgId;
    return g.tasks.map((t) => ({
      orgId,
      taskId: t.id,
      title: t.title,
      workspaceName: g.workspace.name,
      projectName: t.project.name,
      clientVisible: t.clientVisible,
    }));
  });
}

/** One task for a new EOD line — the person must still be assigned to its workspace. */
export async function workTaskForLine(
  homeUserId: string,
  orgId: string,
  taskId: string,
): Promise<Omit<WorkLineSeed, "minutes">> {
  const ws = await linkedWorkspace(homeUserId, orgId);
  const task = await tenantDb(orgId).workTask.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, status: true, clientVisible: true },
  });
  if (!task) throw new UserFacingError("That task no longer exists");
  return {
    orgId,
    workspaceName: ws.name,
    taskId,
    title: task.title,
    status: task.status as WorkTaskStatus,
    clientVisible: task.clientVisible,
  };
}

/**
 * A submitted EOD line, applied in its workspace as the person's linked
 * account: the status change (logged and audited there like any other), and
 * — when the line is shared with the client — what they did, on the
 * client's day card.
 */
export async function applyEodLine(
  homeUserId: string,
  line: {
    orgId: string;
    taskId: string;
    statusAfter: WorkTaskStatus | null;
    workDone: string;
    clientVisible: boolean;
  },
) {
  const ws = await linkedWorkspace(homeUserId, line.orgId);
  const actor: WorkActor = {
    userId: ws.linkedUserId,
    scope: workScope({
      userId: ws.linkedUserId,
      role: ws.role,
      isAssigned: true,
      orgKind: "TASKS",
    }),
    orgKind: "TASKS",
  };
  await runAsTenant({ id: ws.orgId, slug: ws.slug }, async () => {
    const task = await tenantDb(ws.orgId).workTask.findUnique({
      where: { id: line.taskId },
      select: { status: true },
    });
    if (!task) return; // deleted since — the report still records what was done
    if (line.statusAfter && line.statusAfter !== task.status)
      await updateTask(actor, line.taskId, { status: line.statusAfter });
    const text = line.workDone.trim();
    // A reopened report submitted again doesn't post the same update twice.
    const already = await tenantDb(ws.orgId).workTaskActivity.findFirst({
      where: { taskId: line.taskId, actorId: ws.linkedUserId, kind: "REPORTED", to: text },
      select: { id: true },
    });
    if (text && !already) await recordReport(actor, line.taskId, text, line.clientVisible);
  });
}
