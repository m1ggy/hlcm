"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, assertApplicationAccess, ForbiddenError, AppRole } from "@/lib/rbac";
import { recordFieldChanges, recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";

const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "NA", "CLOSED"] as const;

const userRefSelect = { select: { id: true, name: true } } as const;

const taskInclude = {
  assignees: { include: { user: userRefSelect } },
  reviewers: { include: { user: userRefSelect } },
  subtasks: {
    where: { archived: false },
    include: {
      assignees: { include: { user: userRefSelect } },
      reviewers: { include: { user: userRefSelect } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.TaskInclude;

type TaskUserRef = { id: string; name: string };
type RawTask = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function mapUserRefs(rows: { user: TaskUserRef }[]): TaskUserRef[] {
  return rows.map((r) => r.user);
}

// Components never see the join-row (`{userId, user: {id, name}}`) shape —
// this flattens every query result to plain `assignedUsers`/`reviewers`
// arrays of `{id, name}`. Generic over `T extends RawTask` (rather than a
// fixed return type) so TypeScript keeps whatever extra fields a caller's
// query tacked on beyond taskInclude (e.g. listMyTasks's `application`
// include). Subtasks are always present (taskInclude selects them
// unconditionally) and never have their own subtasks — matching the
// schema's real one-level-deep shape — so that mapping is a plain inline
// pass, not a recursive call.
function toTaskItem<T extends RawTask>(task: T) {
  const { assignees, reviewers, subtasks, ...rest } = task;
  return {
    ...rest,
    assignedUsers: mapUserRefs(assignees),
    reviewers: mapUserRefs(reviewers),
    subtasks: subtasks.map((s) => {
      const { assignees: subAssignees, reviewers: subReviewers, ...subRest } = s;
      return { ...subRest, assignedUsers: mapUserRefs(subAssignees), reviewers: mapUserRefs(subReviewers) };
    }),
  };
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

// `recordFieldChanges` compares via JSON.stringify — sort so id-set
// equality doesn't depend on insertion order.
function sortedIds(ids: string[]) {
  return [...new Set(ids)].sort();
}

function newlyAdded(before: string[], after: string[]) {
  const beforeSet = new Set(before);
  return after.filter((id) => !beforeSet.has(id));
}

async function assertCanEditTask(
  session: Awaited<ReturnType<typeof requireSession>>,
  task: { applicationId: string | null; assignedUserIds: string[] }
) {
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, "edit");
  } else {
    const role = session.user.role as AppRole;
    if (role === "ADMIN" || role === "MANAGER") return;
    if (!task.assignedUserIds.includes(session.user.id)) throw new ForbiddenError("Not your task");
  }
}

export async function listTasksForApplication(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  const [phases, tasks] = await Promise.all([
    prisma.phase.findMany({ where: { applicationId }, orderBy: { sortOrder: "asc" } }),
    prisma.task.findMany({
      where: { applicationId, parentTaskId: null, archived: false },
      include: taskInclude,
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return { phases, tasks: tasks.map((t) => toTaskItem(t)) };
}

const createTaskSchema = z.object({
  applicationId: z.string().min(1),
  phaseId: z.string().optional(),
  parentTaskId: z.string().optional(),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  assignedUserIds: z.array(z.string().min(1)).min(1, "At least one assignee is required"),
  dueDate: z.string().optional(),
});

export async function createTask(formData: FormData) {
  const session = await requireSession();
  const parsed = createTaskSchema.parse({
    applicationId: formData.get("applicationId"),
    phaseId: formData.get("phaseId") || undefined,
    parentTaskId: formData.get("parentTaskId") || undefined,
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    assignedUserIds: uniqueIds(formData.getAll("assignedUserId").map(String).filter(Boolean)),
    dueDate: formData.get("dueDate") || undefined,
  });

  await assertCanEditTask(session, { applicationId: parsed.applicationId, assignedUserIds: [session.user.id] });

  const task = await prisma.task.create({
    data: {
      applicationId: parsed.applicationId,
      phaseId: parsed.phaseId,
      parentTaskId: parsed.parentTaskId,
      label: parsed.label,
      description: parsed.description,
      assignees: { create: parsed.assignedUserIds.map((userId) => ({ userId })) },
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      createdById: session.user.id,
    },
    include: taskInclude,
  });

  await recordAudit({
    entityType: "Task",
    entityId: task.id,
    action: parsed.parentTaskId ? "create_subtask" : "create",
    actorId: session.user.id,
  });

  for (const userId of parsed.assignedUserIds) {
    await notify(
      {
        userId,
        type: "TASK_ASSIGNED",
        message: `You were assigned "${task.label}"`,
        entityType: "Task",
        entityId: task.id,
      },
      session.user.id
    );
  }

  revalidatePath(`/applications/${parsed.applicationId}`);
  return toTaskItem(task);
}

const updateTaskSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  assignedUserIds: z.array(z.string().min(1)).min(1, "At least one assignee is required").optional(),
  status: z.enum(TASK_STATUSES).optional(),
  blockedReason: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function updateTask(taskId: string, formData: FormData) {
  const session = await requireSession();
  const before = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
  await assertCanEditTask(session, {
    applicationId: before.applicationId,
    assignedUserIds: before.assignees.map((a) => a.userId),
  });

  const rawAssignedUserIds = uniqueIds(formData.getAll("assignedUserId").map(String).filter(Boolean));
  const parsed = updateTaskSchema.parse({
    label: formData.get("label") || undefined,
    description: formData.get("description") ?? undefined,
    assignedUserIds: rawAssignedUserIds.length ? rawAssignedUserIds : undefined,
    status: formData.get("status") || undefined,
    blockedReason: formData.get("blockedReason") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
  });

  await prisma.$transaction(async (tx) => {
    if (parsed.assignedUserIds) {
      await tx.taskAssignee.deleteMany({ where: { taskId } });
      await tx.taskAssignee.createMany({ data: parsed.assignedUserIds.map((userId) => ({ taskId, userId })) });
    }
    await tx.task.update({
      where: { id: taskId },
      data: {
        label: parsed.label,
        description: parsed.description,
        status: parsed.status,
        // A resolved/changed status clears any stale "waiting on X" note.
        blockedReason: parsed.status && parsed.status !== "BLOCKED" ? null : parsed.blockedReason,
        dueDate: parsed.dueDate !== undefined ? (parsed.dueDate ? new Date(parsed.dueDate) : null) : undefined,
      },
    });
  });

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } }, reviewers: { select: { userId: true } } },
  });

  const beforeAssigneeIds = sortedIds(before.assignees.map((a) => a.userId));
  const afterAssigneeIds = sortedIds(task.assignees.map((a) => a.userId));

  // Explicit before/after objects, not `{...before, ...}` — `before`/`task`
  // carry raw `assignees`/`reviewers` join-row arrays that would otherwise
  // register as their own (unlabeled, unreadable) changed field alongside
  // the flattened `assignedUserIds` we actually want logged.
  await recordFieldChanges({
    entityType: "Task",
    entityId: taskId,
    actorId: session.user.id,
    action: "update",
    before: {
      label: before.label,
      description: before.description,
      status: before.status,
      blockedReason: before.blockedReason,
      dueDate: before.dueDate,
      assignedUserIds: beforeAssigneeIds,
    },
    after: {
      label: task.label,
      description: task.description,
      status: task.status,
      blockedReason: task.blockedReason,
      dueDate: task.dueDate,
      assignedUserIds: afterAssigneeIds,
    },
  });

  for (const userId of newlyAdded(beforeAssigneeIds, afterAssigneeIds)) {
    await notify(
      {
        userId,
        type: "TASK_REASSIGNED",
        message: `You were assigned "${task.label}"`,
        entityType: "Task",
        entityId: taskId,
      },
      session.user.id
    );
  }
  if (before.status !== task.status) {
    for (const reviewer of task.reviewers) {
      await notify(
        {
          userId: reviewer.userId,
          type: "TASK_STATUS_CHANGED",
          message: `"${task.label}" changed to ${task.status}`,
          entityType: "Task",
          entityId: taskId,
        },
        session.user.id
      );
    }
  }

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return task;
}

// Drag-drop reordering within one phase (or the unphased group) of an
// Application's checklist — `orderedTaskIds` is the full new order for that
// single group, sortOrder just becomes each id's index in the array.
export async function reorderTasks(applicationId: string, orderedTaskIds: string[]) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  await prisma.$transaction(
    orderedTaskIds.map((id, index) =>
      prisma.task.updateMany({ where: { id, applicationId }, data: { sortOrder: index } })
    )
  );

  revalidatePath(`/applications/${applicationId}`);
}

export async function getTaskAuditLog(taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, "view");
  } else {
    const role = session.user.role as AppRole;
    const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
    if (!(role === "ADMIN" || role === "MANAGER" || isAssignee)) {
      throw new ForbiddenError("Not your task");
    }
  }

  return prisma.auditLog.findMany({
    where: { entityType: "Task", entityId: taskId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function setTaskReviewers(taskId: string, reviewerUserIds: string[]) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } }, reviewers: { select: { userId: true } } },
  });
  await assertCanEditTask(session, {
    applicationId: task.applicationId,
    assignedUserIds: task.assignees.map((a) => a.userId),
  });

  const before = sortedIds(task.reviewers.map((r) => r.userId));
  const after = sortedIds(reviewerUserIds);

  await prisma.$transaction([
    prisma.taskReviewer.deleteMany({ where: { taskId } }),
    prisma.taskReviewer.createMany({ data: after.map((userId) => ({ taskId, userId })) }),
  ]);

  await recordFieldChanges({
    entityType: "Task",
    entityId: taskId,
    actorId: session.user.id,
    action: "set_reviewers",
    before: { reviewerUserIds: before },
    after: { reviewerUserIds: after },
  });

  for (const userId of newlyAdded(before, after)) {
    await notify(
      {
        userId,
        type: "TASK_REVIEW_REQUESTED",
        message: `Flagged for your review: "${task.label}"`,
        entityType: "Task",
        entityId: taskId,
      },
      session.user.id
    );
  }

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
}

// Everything assigned to the current user — standalone tasks (e.g. weekly
// client report) and case-tied tasks alike, so "My Tasks" is actually a
// complete list of what's on someone's plate rather than just the
// not-part-of-a-case subset. Always scoped to the caller, regardless of
// role — a manager's "My Tasks" is their own tasks, not everyone's (see the
// Applications/Tasks board views for the all-staff picture).
// Tasks on an archived case are left out, same as the Applications list
// filtering to active cases by default.
export async function listMyTasks() {
  const session = await requireSession();

  const tasks = await prisma.task.findMany({
    where: {
      assignees: { some: { userId: session.user.id } },
      parentTaskId: null,
      archived: false,
      OR: [{ applicationId: null }, { application: { active: true } }],
    },
    include: {
      ...taskInclude,
      application: { select: { id: true, name: true, client: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  return tasks.map((task) => ({
    ...toTaskItem(task),
    isOverdue:
      !!task.dueDate &&
      task.dueDate.getTime() < now &&
      !TASK_CLOSED_STATUSES.includes(task.status as (typeof TASK_CLOSED_STATUSES)[number]),
  }));
}

const standaloneTaskSchema = z.object({
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  assignedUserIds: z.array(z.string().min(1)).min(1, "At least one assignee is required"),
  dueDate: z.string().optional(),
  recurrenceRule: z.string().optional(),
  parentTaskId: z.string().optional(),
});

export async function createStandaloneTask(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const rawAssignedUserIds = uniqueIds(formData.getAll("assignedUserId").map(String).filter(Boolean));
  const parsed = standaloneTaskSchema.parse({
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    assignedUserIds: rawAssignedUserIds.length ? rawAssignedUserIds : [session.user.id],
    dueDate: formData.get("dueDate") || undefined,
    recurrenceRule: formData.get("recurrenceRule") || undefined,
    parentTaskId: formData.get("parentTaskId") || undefined,
  });

  if (parsed.parentTaskId) {
    const parent = await prisma.task.findUniqueOrThrow({
      where: { id: parsed.parentTaskId },
      include: { assignees: { select: { userId: true } } },
    });
    await assertCanEditTask(session, {
      applicationId: parent.applicationId,
      assignedUserIds: parent.assignees.map((a) => a.userId),
    });
  }

  const task = await prisma.task.create({
    data: {
      label: parsed.label,
      description: parsed.description,
      assignees: { create: parsed.assignedUserIds.map((userId) => ({ userId })) },
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      recurrenceRule: parsed.parentTaskId ? undefined : parsed.recurrenceRule,
      parentTaskId: parsed.parentTaskId,
      createdById: session.user.id,
    },
    include: taskInclude,
  });

  await recordAudit({
    entityType: "Task",
    entityId: task.id,
    action: parsed.parentTaskId ? "create_subtask" : "create_standalone",
    actorId: session.user.id,
  });

  for (const userId of parsed.assignedUserIds) {
    await notify(
      {
        userId,
        type: "TASK_ASSIGNED",
        message: `You were assigned "${task.label}"`,
        entityType: "Task",
        entityId: task.id,
      },
      session.user.id
    );
  }

  revalidatePath("/tasks");
  return toTaskItem(task);
}

// Soft delete — admin-only. Archived tasks drop out of the checklist and My
// Tasks lists (see listTasksForApplication/listMyTasks) but the row stays in
// the DB, so nothing here needs cascading deletes or FK cleanup.
export async function archiveTask(taskId: string) {
  const session = await requireRole(["ADMIN"]);
  const task = await prisma.task.update({ where: { id: taskId }, data: { archived: true } });

  await recordAudit({ entityType: "Task", entityId: taskId, action: "archive", actorId: session.user.id });

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return task;
}

export async function restoreTask(taskId: string) {
  const session = await requireRole(["ADMIN"]);
  const task = await prisma.task.update({ where: { id: taskId }, data: { archived: false } });

  await recordAudit({ entityType: "Task", entityId: taskId, action: "restore", actorId: session.user.id });

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return task;
}
