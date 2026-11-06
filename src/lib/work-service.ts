import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";
import {
  PROJECT_COLORS,
  WORK_PROJECT_STATUSES,
  WORK_TASK_PRIORITIES,
  WORK_TASK_STATUSES,
  projectWhere,
  taskWhere,
  type WorkScope,
  type WorkTaskStatus,
} from "@/lib/work";
import { listAssignableUsers } from "@/lib/work-data";
import type { $Enums } from "@/generated/prisma/client";

// Changes to projects and tasks (docs/workspace-tasks-plan.md, Phase 2). No
// session or Next.js imports: the server actions in src/lib/actions/work.ts
// build the actor and send the returned notifications, and tests call these
// directly inside runAsTenant.

export type WorkActor = { userId: string; scope: WorkScope; orgKind: "FULL" | "TASKS" };

export type WorkNotification = {
  userId: string;
  type: $Enums.NotificationType;
  message: string;
  entityType: "WorkTask";
  entityId: string;
};

type ActivityKind = $Enums.WorkActivityKind;

function requireTeam(actor: WorkActor) {
  if (!actor.scope.canEditTasks) throw new UserFacingError("Only the team working on this can change tasks");
}

function requireManager(actor: WorkActor) {
  if (!actor.scope.canManageProjects) throw new UserFacingError("Only managers can change projects");
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-30")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));
const optionalDate = z.union([dateOnly, z.literal("").transform(() => null), z.null()]).optional();
const optionalText = z
  .string()
  .max(20_000)
  .optional()
  .nullable()
  .transform((s) => (s?.trim() ? s.trim() : null));

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new UserFacingError(result.error.issues[0]?.message ?? "Check the form and try again");
  return result.data;
}

async function logActivity(
  task: { id: string; projectId: string; clientVisible: boolean },
  actorId: string,
  kind: ActivityKind,
  opts: { from?: string | null; to?: string | null; clientVisible?: boolean } = {}
) {
  await db.workTaskActivity.create({
    data: {
      taskId: task.id,
      projectId: task.projectId,
      actorId,
      kind,
      from: opts.from ?? null,
      to: opts.to ?? null,
      clientVisible: opts.clientVisible ?? task.clientVisible,
    },
  });
}

async function findVisibleTask(actor: WorkActor, taskId: string) {
  const task = await db.workTask.findFirst({
    where: { id: taskId, ...taskWhere(actor.scope) },
    include: { project: { select: { id: true, name: true, clientVisible: true, leadId: true } }, assignees: { select: { userId: true } } },
  });
  if (!task) throw new UserFacingError("That task doesn't exist or you can't see it");
  return task;
}

// ---- Projects -------------------------------------------------------------

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(200),
  description: optionalText,
  color: z.enum(Object.keys(PROJECT_COLORS) as [string, ...string[]]).optional(),
  status: z.enum(WORK_PROJECT_STATUSES).optional(),
  clientVisible: z.boolean().optional(),
  leadId: z.string().optional().nullable(),
  startDate: optionalDate,
  dueDate: optionalDate,
});

export type ProjectInput = z.input<typeof projectSchema>;

async function assertAssignable(actor: WorkActor, userIds: string[]) {
  if (userIds.length === 0) return;
  const allowed = new Set((await listAssignableUsers(actor.orgKind)).map((u) => u.id));
  if (userIds.some((id) => !allowed.has(id))) throw new UserFacingError("Pick people from the team");
}

export async function createProject(actor: WorkActor, input: ProjectInput) {
  requireManager(actor);
  const data = parse(projectSchema, input);
  if (data.leadId) await assertAssignable(actor, [data.leadId]);
  const project = await db.workProject.create({
    data: {
      name: data.name,
      description: data.description,
      color: data.color ?? "blue",
      status: data.status ?? "ACTIVE",
      clientVisible: data.clientVisible ?? true,
      leadId: data.leadId || null,
      startDate: data.startDate ?? null,
      dueDate: data.dueDate ?? null,
      createdById: actor.userId,
    },
  });
  await recordAudit({ entityType: "WorkProject", entityId: project.id, action: "create", actorId: actor.userId, newValue: project.name });
  return project;
}

export async function updateProject(actor: WorkActor, projectId: string, input: Partial<ProjectInput>) {
  requireManager(actor);
  const data = parse(projectSchema.partial(), input);
  const before = await db.workProject.findUnique({ where: { id: projectId } });
  if (!before) throw new UserFacingError("That project doesn't exist");
  if (data.leadId) await assertAssignable(actor, [data.leadId]);
  const project = await db.workProject.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.clientVisible !== undefined && { clientVisible: data.clientVisible }),
      ...(data.leadId !== undefined && { leadId: data.leadId || null }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
    },
  });
  for (const field of ["name", "status", "clientVisible", "leadId"] as const) {
    if (data[field] !== undefined && before[field] !== project[field]) {
      await recordAudit({ entityType: "WorkProject", entityId: projectId, action: "update", actorId: actor.userId, field, oldValue: before[field], newValue: project[field] });
    }
  }
  return project;
}

// ---- Tasks ----------------------------------------------------------------

const taskSchema = z.object({
  projectId: z.string().min(1),
  parentId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Give the task a title").max(500),
  description: optionalText,
  status: z.enum(WORK_TASK_STATUSES).optional(),
  priority: z.enum(WORK_TASK_PRIORITIES).optional(),
  startDate: optionalDate,
  dueDate: optionalDate,
  clientVisible: z.boolean().optional(),
  estimateHours: z.number().min(0).max(10_000).optional().nullable(),
  assigneeIds: z.array(z.string()).max(50).optional(),
});

export type TaskInput = z.input<typeof taskSchema>;

function assignedMessage(title: string, projectName: string) {
  return `You were assigned "${title}" in ${projectName}`;
}

export async function createTask(actor: WorkActor, input: TaskInput) {
  requireTeam(actor);
  const data = parse(taskSchema, input);
  const project = await db.workProject.findFirst({ where: { id: data.projectId, ...projectWhere(actor.scope) } });
  if (!project) throw new UserFacingError("That project doesn't exist");
  if (project.status === "ARCHIVED") throw new UserFacingError("Unarchive the project to add tasks");
  if (data.parentId) {
    const parent = await db.workTask.findUnique({ where: { id: data.parentId }, select: { projectId: true, parentId: true } });
    if (!parent || parent.projectId !== project.id) throw new UserFacingError("A subtask has to be in the same project");
    if (parent.parentId) throw new UserFacingError("Subtasks can't have their own subtasks");
  }
  const assigneeIds = [...new Set(data.assigneeIds ?? [])];
  await assertAssignable(actor, assigneeIds);
  const last = await db.workTask.aggregate({ where: { projectId: project.id, parentId: data.parentId ?? null }, _max: { sortOrder: true } });
  const status = data.status ?? "TODO";
  const task = await db.workTask.create({
    data: {
      projectId: project.id,
      parentId: data.parentId || null,
      title: data.title,
      description: data.description,
      status,
      priority: data.priority ?? "NORMAL",
      startDate: data.startDate ?? null,
      dueDate: data.dueDate ?? null,
      clientVisible: data.clientVisible ?? project.clientVisible,
      estimateHours: data.estimateHours ?? null,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      createdById: actor.userId,
      ...(status === "DONE" && { completedAt: new Date(), completedById: actor.userId }),
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
  });
  await logActivity(task, actor.userId, "CREATED", { to: task.title });
  await recordAudit({ entityType: "WorkTask", entityId: task.id, action: "create", actorId: actor.userId, newValue: task.title });
  const notifications: WorkNotification[] = assigneeIds
    .filter((id) => id !== actor.userId)
    .map((userId) => ({ userId, type: "WORK_TASK_ASSIGNED", message: assignedMessage(task.title, project.name), entityType: "WorkTask", entityId: task.id }));
  return { task, notifications };
}

const taskPatchSchema = taskSchema.omit({ projectId: true, parentId: true, assigneeIds: true }).partial();
export type TaskPatch = z.input<typeof taskPatchSchema>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function updateTask(actor: WorkActor, taskId: string, patch: TaskPatch) {
  requireTeam(actor);
  const data = parse(taskPatchSchema, patch);
  const before = await findVisibleTask(actor, taskId);
  const statusChanged = data.status !== undefined && data.status !== before.status;
  const task = await db.workTask.update({
    where: { id: taskId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.clientVisible !== undefined && { clientVisible: data.clientVisible }),
      ...(data.estimateHours !== undefined && { estimateHours: data.estimateHours }),
      ...(statusChanged && {
        status: data.status,
        ...(data.status === "DONE" ? { completedAt: new Date(), completedById: actor.userId } : { completedAt: null, completedById: null }),
      }),
    },
  });
  if (statusChanged) {
    await logActivity(task, actor.userId, "STATUS_CHANGED", { from: before.status, to: task.status });
  }
  if (data.dueDate !== undefined && day(before.dueDate) !== day(task.dueDate)) {
    await logActivity(task, actor.userId, "DUE_CHANGED", { from: day(before.dueDate), to: day(task.dueDate) });
  }
  for (const field of ["title", "status", "priority", "dueDate", "clientVisible"] as const) {
    if (data[field] !== undefined && String(before[field]) !== String(task[field])) {
      await recordAudit({ entityType: "WorkTask", entityId: taskId, action: "update", actorId: actor.userId, field, oldValue: before[field], newValue: task[field] });
    }
  }
  return task;
}

/**
 * Board drag: puts a task in `status` and renumbers that column in the
 * given order (ids of the column after the drop, the moved task included).
 */
export async function moveTask(actor: WorkActor, taskId: string, status: WorkTaskStatus, orderedIds: string[]) {
  requireTeam(actor);
  const task = await findVisibleTask(actor, taskId);
  if (task.status !== status) await updateTask(actor, taskId, { status });
  const siblings = await db.workTask.findMany({ where: { id: { in: orderedIds }, projectId: task.projectId, parentId: task.parentId }, select: { id: true } });
  const valid = new Set(siblings.map((s) => s.id));
  let order = 0;
  for (const id of orderedIds) {
    if (!valid.has(id)) continue;
    order += 1;
    await db.workTask.update({ where: { id }, data: { sortOrder: order } });
  }
}

export async function setAssignees(actor: WorkActor, taskId: string, userIds: string[]) {
  requireTeam(actor);
  const task = await findVisibleTask(actor, taskId);
  const next = [...new Set(userIds)];
  await assertAssignable(actor, next);
  const current = new Set(task.assignees.map((a) => a.userId));
  const added = next.filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !next.includes(id));
  if (added.length === 0 && removed.length === 0) return { notifications: [] as WorkNotification[] };
  const names = new Map((await db.user.findMany({ where: { id: { in: [...added, ...removed] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  if (removed.length) await db.workTaskAssignee.deleteMany({ where: { taskId, userId: { in: removed } } });
  if (added.length) await db.workTaskAssignee.createMany({ data: added.map((userId) => ({ taskId, userId })) });
  for (const id of added) await logActivity(task, actor.userId, "ASSIGNED", { to: names.get(id) ?? null });
  for (const id of removed) await logActivity(task, actor.userId, "UNASSIGNED", { from: names.get(id) ?? null });
  await recordAudit({ entityType: "WorkTask", entityId: taskId, action: "update", actorId: actor.userId, field: "assignees", oldValue: [...current], newValue: next });
  const notifications: WorkNotification[] = added
    .filter((id) => id !== actor.userId)
    .map((userId) => ({ userId, type: "WORK_TASK_ASSIGNED", message: assignedMessage(task.title, task.project.name), entityType: "WorkTask", entityId: taskId }));
  return { notifications };
}

export async function deleteTask(actor: WorkActor, taskId: string) {
  requireTeam(actor);
  const task = await findVisibleTask(actor, taskId);
  if (!actor.scope.canManageProjects && task.createdById !== actor.userId) {
    throw new UserFacingError("Only a manager or the person who created it can delete a task");
  }
  await db.workTask.delete({ where: { id: taskId } });
  await recordAudit({ entityType: "WorkTask", entityId: taskId, action: "delete", actorId: actor.userId, oldValue: task.title });
  return task;
}

// ---- Comments -------------------------------------------------------------

const commentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(10_000),
  visibility: z.enum(["INTERNAL", "CLIENT"]),
});

/** Who hears about a comment: assignees, the creator and the project lead — never the author, and never a client-side person for an internal note. */
async function commentRecipients(task: { createdById: string; assignees: { userId: string }[]; project: { leadId: string | null } }, internal: boolean) {
  const ids = new Set([task.createdById, ...task.assignees.map((a) => a.userId), ...(task.project.leadId ? [task.project.leadId] : [])]);
  if (!internal) return [...ids];
  const team = new Set((await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, role: true, assignedFromUserId: true } }))
    .filter((u) => u.role !== "CLIENT" && u.role !== "CAREGIVER")
    .map((u) => u.id));
  return [...ids].filter((id) => team.has(id));
}

export async function addComment(actor: WorkActor, taskId: string, input: { body: string; visibility?: "INTERNAL" | "CLIENT" }) {
  if (!actor.scope.canComment) throw new UserFacingError("You can't comment here");
  // Client-side people can only write client comments.
  const data = parse(commentSchema, { body: input.body, visibility: actor.scope.canSeeInternal ? (input.visibility ?? "INTERNAL") : "CLIENT" });
  const task = await findVisibleTask(actor, taskId);
  const comment = await db.workTaskComment.create({ data: { taskId, authorId: actor.userId, body: data.body, visibility: data.visibility } });
  await logActivity(task, actor.userId, "COMMENTED", { clientVisible: task.clientVisible && data.visibility === "CLIENT" });
  let recipients = await commentRecipients(task, data.visibility === "INTERNAL");
  if (actor.orgKind === "TASKS" && data.visibility === "INTERNAL") {
    // In a client's workspace, the client's own people are client-side
    // whatever their role: only linked accounts hear internal notes.
    const linked = new Set((await db.user.findMany({ where: { id: { in: recipients }, assignedFromUserId: { not: null } }, select: { id: true } })).map((u) => u.id));
    recipients = recipients.filter((id) => linked.has(id));
  }
  const notifications: WorkNotification[] = recipients
    .filter((id) => id !== actor.userId)
    .map((userId) => ({ userId, type: "WORK_TASK_COMMENTED", message: `New comment on "${task.title}"`, entityType: "WorkTask", entityId: taskId }));
  return { comment, notifications };
}

export async function deleteComment(actor: WorkActor, commentId: string) {
  const comment = await db.workTaskComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new UserFacingError("That comment is already gone");
  if (comment.authorId !== actor.userId && !actor.scope.canManageProjects) throw new UserFacingError("You can only delete your own comments");
  await findVisibleTask(actor, comment.taskId);
  await db.workTaskComment.delete({ where: { id: commentId } });
  await recordAudit({ entityType: "WorkTask", entityId: comment.taskId, action: "delete_comment", actorId: actor.userId, oldValue: comment.body.slice(0, 200) });
}

// ---- Client requests ------------------------------------------------------

const requestSchema = z.object({
  projectId: z.string().min(1, "Pick a project"),
  title: z.string().trim().min(1, "Say what you need").max(500),
  details: optionalText,
  dueDate: optionalDate,
});

export type RequestInput = z.input<typeof requestSchema>;

export async function requestTask(actor: WorkActor, input: RequestInput) {
  if (!actor.scope.canRequestTasks) throw new UserFacingError("Only clients can request tasks");
  const data = parse(requestSchema, input);
  const project = await db.workProject.findFirst({ where: { id: data.projectId, ...projectWhere(actor.scope), status: { in: ["ACTIVE", "ON_HOLD"] } } });
  if (!project) throw new UserFacingError("Pick one of your active projects");
  const last = await db.workTask.aggregate({ where: { projectId: project.id, parentId: null }, _max: { sortOrder: true } });
  const task = await db.workTask.create({
    data: {
      projectId: project.id,
      title: data.title,
      description: data.details,
      dueDate: data.dueDate ?? null,
      clientVisible: true,
      isClientRequest: true,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      createdById: actor.userId,
    },
  });
  await logActivity(task, actor.userId, "REQUESTED", { to: task.title });
  await recordAudit({ entityType: "WorkTask", entityId: task.id, action: "request", actorId: actor.userId, newValue: task.title });
  // The project lead hears about it; with no lead, every manager on the team.
  const recipients = project.leadId
    ? [project.leadId]
    : (await db.user.findMany({
        where: {
          active: true,
          isSupport: false,
          role: { in: ["OWNER", "ADMIN", "MANAGER"] },
          ...(actor.orgKind === "TASKS" ? { assignedFromUserId: { not: null } } : {}),
        },
        select: { id: true },
      })).map((u) => u.id);
  const notifications: WorkNotification[] = recipients.map((userId) => ({
    userId,
    type: "WORK_TASK_REQUESTED",
    message: `New request in ${project.name}: "${task.title}"`,
    entityType: "WorkTask",
    entityId: task.id,
  }));
  return { task, notifications };
}

export async function declineRequest(actor: WorkActor, taskId: string, reason: string) {
  requireManager(actor);
  const why = reason.trim();
  if (!why) throw new UserFacingError("Tell the client why");
  const task = await findVisibleTask(actor, taskId);
  if (!task.isClientRequest) throw new UserFacingError("Only client requests can be declined");
  const updated = await db.workTask.update({ where: { id: taskId }, data: { status: "CANCELLED", declineReason: why, completedAt: null, completedById: null } });
  await logActivity(updated, actor.userId, "DECLINED", { from: task.status, to: why });
  await recordAudit({ entityType: "WorkTask", entityId: taskId, action: "decline_request", actorId: actor.userId, newValue: why });
  const notifications: WorkNotification[] =
    task.createdById === actor.userId
      ? []
      : [{ userId: task.createdById, type: "WORK_TASK_COMMENTED", message: `Your request "${task.title}" was declined: ${why}`, entityType: "WorkTask", entityId: taskId }];
  return { notifications };
}

// ---- Files ----------------------------------------------------------------

/** Who may attach a file: the team, or a client on a task they can see. */
export async function assertCanAttach(actor: WorkActor, taskId: string) {
  if (actor.scope.side === "none") throw new UserFacingError("You can't add files here");
  return findVisibleTask(actor, taskId);
}

export async function recordFileAdded(actor: WorkActor, task: { id: string; projectId: string; clientVisible: boolean }, fileName: string) {
  await logActivity(task, actor.userId, "FILE_ADDED", { to: fileName });
}
