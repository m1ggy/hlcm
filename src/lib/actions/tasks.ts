"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, assertApplicationAccess, ForbiddenError, AppRole } from "@/lib/rbac";
import { recordFieldChanges, recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "NA"] as const;

const taskInclude = {
  assignedUser: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  subtasks: {
    include: {
      assignedUser: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
} as const;

async function assertCanEditTask(
  session: Awaited<ReturnType<typeof requireSession>>,
  task: { applicationId: string | null; assignedUserId: string }
) {
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, "edit");
  } else {
    const role = session.user.role as AppRole;
    if (role === "ADMIN" || role === "MANAGER") return;
    if (task.assignedUserId !== session.user.id) throw new ForbiddenError("Not your task");
  }
}

export async function listTasksForApplication(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  const [phases, tasks] = await Promise.all([
    prisma.phase.findMany({ where: { applicationId }, orderBy: { sortOrder: "asc" } }),
    prisma.task.findMany({
      where: { applicationId, parentTaskId: null },
      include: taskInclude,
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return { phases, tasks };
}

const createTaskSchema = z.object({
  applicationId: z.string().min(1),
  phaseId: z.string().optional(),
  parentTaskId: z.string().optional(),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  assignedUserId: z.string().min(1),
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
    assignedUserId: formData.get("assignedUserId"),
    dueDate: formData.get("dueDate") || undefined,
  });

  await assertCanEditTask(session, { applicationId: parsed.applicationId, assignedUserId: session.user.id });

  const task = await prisma.task.create({
    data: {
      applicationId: parsed.applicationId,
      phaseId: parsed.phaseId,
      parentTaskId: parsed.parentTaskId,
      label: parsed.label,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      createdById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Task",
    entityId: task.id,
    action: parsed.parentTaskId ? "create_subtask" : "create",
    actorId: session.user.id,
  });

  revalidatePath(`/applications/${parsed.applicationId}`);
  return task;
}

const updateTaskSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  assignedUserId: z.string().min(1).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  blockedReason: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function updateTask(taskId: string, formData: FormData) {
  const session = await requireSession();
  const before = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(session, before);

  const parsed = updateTaskSchema.parse({
    label: formData.get("label") || undefined,
    description: formData.get("description") ?? undefined,
    assignedUserId: formData.get("assignedUserId") || undefined,
    status: formData.get("status") || undefined,
    blockedReason: formData.get("blockedReason") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
  });

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      label: parsed.label,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      status: parsed.status,
      // A resolved/changed status clears any stale "waiting on X" note.
      blockedReason: parsed.status && parsed.status !== "BLOCKED" ? null : parsed.blockedReason,
      dueDate: parsed.dueDate !== undefined ? (parsed.dueDate ? new Date(parsed.dueDate) : null) : undefined,
    },
  });

  await recordFieldChanges({
    entityType: "Task",
    entityId: taskId,
    actorId: session.user.id,
    action: "update",
    before,
    after: task,
  });

  if (before.assignedUserId !== task.assignedUserId) {
    await notify(
      {
        userId: task.assignedUserId,
        type: "TASK_REASSIGNED",
        message: `You were assigned "${task.label}"`,
        entityType: "Task",
        entityId: taskId,
      },
      session.user.id
    );
  }
  if (before.status !== task.status && task.reviewerUserId) {
    await notify(
      {
        userId: task.reviewerUserId,
        type: "TASK_STATUS_CHANGED",
        message: `"${task.label}" changed to ${task.status}`,
        entityType: "Task",
        entityId: taskId,
      },
      session.user.id
    );
  }

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return task;
}

export async function setTaskReviewer(taskId: string, reviewerUserId: string | null) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanEditTask(session, task);

  await prisma.task.update({ where: { id: taskId }, data: { reviewerUserId } });

  await recordAudit({
    entityType: "Task",
    entityId: taskId,
    action: reviewerUserId ? "flag_for_review" : "clear_review",
    actorId: session.user.id,
    newValue: reviewerUserId ?? undefined,
  });

  if (reviewerUserId) {
    await notify(
      {
        userId: reviewerUserId,
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

// Standalone/recurring tasks — not tied to any Application (e.g. weekly
// client report). STAFF only see their own; ADMIN/MANAGER see all.
export async function listStandaloneTasks() {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  const where =
    role === "ADMIN" || role === "MANAGER"
      ? { applicationId: null, parentTaskId: null }
      : { applicationId: null, parentTaskId: null, assignedUserId: session.user.id };

  return prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
}

const standaloneTaskSchema = z.object({
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  assignedUserId: z.string().min(1),
  dueDate: z.string().optional(),
  recurrenceRule: z.string().optional(),
});

export async function createStandaloneTask(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = standaloneTaskSchema.parse({
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    assignedUserId: formData.get("assignedUserId") || session.user.id,
    dueDate: formData.get("dueDate") || undefined,
    recurrenceRule: formData.get("recurrenceRule") || undefined,
  });

  const task = await prisma.task.create({
    data: {
      label: parsed.label,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      recurrenceRule: parsed.recurrenceRule,
      createdById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Task",
    entityId: task.id,
    action: "create_standalone",
    actorId: session.user.id,
  });

  revalidatePath("/tasks");
  return task;
}
