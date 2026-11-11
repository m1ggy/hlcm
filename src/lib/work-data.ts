import { db, currentWorkspaceTimezone } from "@/lib/db";
import {
  activityWhere,
  commentWhere,
  isOpenStatus,
  isOverdue,
  projectWhere,
  taskWhere,
  type WorkScope,
  type WorkTaskStatus,
} from "@/lib/work";

// Reads for projects and tasks (docs/workspace-tasks-plan.md, Phase 2). Every
// query goes through the viewer's WorkScope (src/lib/work.ts), so client-side
// people never receive hidden projects or tasks, internal comments or
// internal activity — the filtering happens in the query, not the page.

const userName = { select: { id: true, name: true } } as const;

/** Today's date (YYYY-MM-DD) in the workspace's timezone. */
export async function workspaceToday(): Promise<string> {
  const timeZone = await currentWorkspaceTimezone();
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export type ProjectCard = Awaited<ReturnType<typeof listProjects>>[number];

export async function listProjects(scope: WorkScope) {
  const projects = await db.workProject.findMany({
    where: projectWhere(scope),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: { lead: userName },
  });
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const [tasks, lastActivity, today] = await Promise.all([
    db.workTask.findMany({
      where: { ...taskWhere(scope), projectId: { in: ids }, parentId: null },
      select: { projectId: true, status: true, dueDate: true, assignees: { select: { user: userName } } },
    }),
    db.workTaskActivity.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, ...activityWhere(scope) },
      _max: { occurredAt: true },
    }),
    workspaceToday(),
  ]);
  return projects.map((p) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    const counted = mine.filter((t) => t.status !== "CANCELLED");
    const people = new Map<string, { id: string; name: string }>();
    for (const t of mine) for (const a of t.assignees) people.set(a.user.id, a.user);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      status: p.status,
      clientVisible: p.clientVisible,
      dueDate: p.dueDate,
      lead: p.lead,
      total: counted.length,
      done: counted.filter((t) => t.status === "DONE").length,
      open: mine.filter((t) => isOpenStatus(t.status as WorkTaskStatus)).length,
      overdue: mine.filter((t) => isOverdue({ status: t.status as WorkTaskStatus, dueDate: t.dueDate }, today)).length,
      lastActivityAt: lastActivity.find((a) => a.projectId === p.id)?._max.occurredAt ?? null,
      people: [...people.values()],
    };
  });
}

export type ProjectTask = NonNullable<Awaited<ReturnType<typeof getProject>>>["tasks"][number];

export async function getProject(scope: WorkScope, projectId: string) {
  const project = await db.workProject.findFirst({
    where: { id: projectId, ...projectWhere(scope) },
    include: { lead: userName },
  });
  if (!project) return null;
  const tasks = await db.workTask.findMany({
    where: { projectId, parentId: null, ...taskWhere(scope) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      clientVisible: true,
      isClientRequest: true,
      approvedAt: true,
      sortOrder: true,
      assignees: { select: { user: userName } },
      subtasks: { where: taskWhere(scope), select: { status: true } },
      _count: { select: { comments: { where: commentWhere(scope) }, files: true } },
    },
  });
  return {
    project,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status as WorkTaskStatus,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      clientVisible: t.clientVisible,
      isClientRequest: t.isClientRequest,
      // A client request no manager has accepted yet (Phase 5 approval queue).
      needsApproval: t.isClientRequest && !t.approvedAt && t.status !== "CANCELLED",
      sortOrder: t.sortOrder,
      assignees: t.assignees.map((a) => a.user),
      subtaskCount: t.subtasks.length,
      subtasksDone: t.subtasks.filter((s) => s.status === "DONE").length,
      commentCount: t._count.comments,
      fileCount: t._count.files,
    })),
  };
}

export async function listProjectActivity(scope: WorkScope, projectId: string, take = 100) {
  return db.workTaskActivity.findMany({
    where: { projectId, ...activityWhere(scope), task: taskWhere(scope) },
    orderBy: { occurredAt: "desc" },
    take,
    include: { actor: userName, task: { select: { id: true, title: true } } },
  });
}

export type TaskDetail = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>;

export async function getTaskDetail(scope: WorkScope, taskId: string) {
  const task = await db.workTask.findFirst({
    where: { id: taskId, ...taskWhere(scope) },
    include: {
      project: { select: { id: true, name: true, clientVisible: true } },
      parent: { select: { id: true, title: true } },
      createdBy: userName,
      completedBy: userName,
      assignees: { select: { user: userName } },
      subtasks: {
        where: taskWhere(scope),
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, status: true, dueDate: true, assignees: { select: { user: userName } } },
      },
      comments: { where: commentWhere(scope), orderBy: { createdAt: "asc" }, include: { author: userName } },
      activities: { where: activityWhere(scope), orderBy: { occurredAt: "desc" }, take: 50, include: { actor: userName } },
      files: {
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: userName },
      },
    },
  });
  if (!task) return null;
  // Tracked hours are internal (hours reach clients only through the weekly
  // summary, and only when the workspace turns that on — Phase 3).
  let trackedHours: number | null = null;
  if (scope.canSeeInternal) {
    const entries = await db.taskTimeEntry.findMany({ where: { workTaskId: taskId }, select: { startedAt: true, endedAt: true } });
    const ms = entries.reduce((sum, e) => sum + ((e.endedAt ?? new Date()).getTime() - e.startedAt.getTime()), 0);
    trackedHours = Math.round((ms / 3_600_000) * 100) / 100;
  }
  return { ...task, trackedHours };
}

export async function listMyWorkTasks(scope: WorkScope, userId: string) {
  if (scope.side !== "team") return [];
  return db.workTask.findMany({
    where: { assignees: { some: { userId } }, status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"] }, project: { status: { not: "ARCHIVED" } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      clientVisible: true,
      project: { select: { id: true, name: true, color: true, clientVisible: true } },
      parent: { select: { title: true } },
    },
  });
}

/**
 * People a task can be assigned to: the team side. In a client's tasks-only
 * workspace, the managing company's linked accounts; in a full workspace,
 * active staff (no clients, caregivers or hidden support accounts).
 */
export async function listAssignableUsers(orgKind: "FULL" | "TASKS") {
  return db.user.findMany({
    where: {
      active: true,
      isSupport: false,
      role: { notIn: ["CLIENT", "CAREGIVER"] },
      ...(orgKind === "TASKS" ? { assignedFromUserId: { not: null } } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Projects a client can file a request under (for the request form). */
export async function listRequestableProjects(scope: WorkScope) {
  return db.workProject.findMany({
    where: { ...projectWhere(scope), status: { in: ["ACTIVE", "ON_HOLD"] } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true },
  });
}
