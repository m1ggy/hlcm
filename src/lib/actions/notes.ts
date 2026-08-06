"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, assertApplicationAccess, ForbiddenError, AppRole } from "@/lib/rbac";
import { notify } from "@/lib/notifications";

async function assertCanCommentOnTask(
  session: Awaited<ReturnType<typeof requireSession>>,
  task: { applicationId: string | null; assignedUserId: string; createdById: string }
) {
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, "view");
    return;
  }
  const role = session.user.role as AppRole;
  if (role === "ADMIN" || role === "MANAGER") return;
  if (task.assignedUserId !== session.user.id && task.createdById !== session.user.id) {
    throw new ForbiddenError("Not your task");
  }
}

export async function listNotes(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  return prisma.note.findMany({
    where: { applicationId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

const addNoteSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().min(1, "Comment can't be empty"),
  mentionedUserIds: z.array(z.string()).default([]),
});

export async function addNote(input: z.infer<typeof addNoteSchema>) {
  const parsed = addNoteSchema.parse(input);
  const session = await requireSession();
  await assertApplicationAccess(session, parsed.applicationId, "view");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: parsed.applicationId },
    select: { name: true },
  });

  const note = await prisma.note.create({
    data: {
      applicationId: parsed.applicationId,
      body: parsed.body,
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  for (const userId of new Set(parsed.mentionedUserIds)) {
    await notify(
      {
        userId,
        type: "MENTIONED",
        message: `${session.user.name} mentioned you in "${application.name}"`,
        entityType: "Application",
        entityId: parsed.applicationId,
      },
      session.user.id
    );
  }

  revalidatePath(`/applications/${parsed.applicationId}`);
  return note;
}

export async function listTaskNotes(taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanCommentOnTask(session, task);

  return prisma.note.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

const addTaskNoteSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1, "Comment can't be empty"),
  mentionedUserIds: z.array(z.string()).default([]),
});

export async function addTaskNote(input: z.infer<typeof addTaskNoteSchema>) {
  const parsed = addTaskNoteSchema.parse(input);
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: parsed.taskId } });
  await assertCanCommentOnTask(session, task);

  const note = await prisma.note.create({
    data: {
      taskId: parsed.taskId,
      body: parsed.body,
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  for (const userId of new Set(parsed.mentionedUserIds)) {
    await notify(
      {
        userId,
        type: "MENTIONED",
        message: `${session.user.name} mentioned you in "${task.label}"`,
        entityType: "Task",
        entityId: parsed.taskId,
      },
      session.user.id
    );
  }

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return note;
}

// Clients aren't ACL-scoped like Applications — same role gate as the rest
// of src/lib/actions/clients.ts.
export async function listClientNotes(clientId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);

  return prisma.note.findMany({
    where: { clientId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

const addClientNoteSchema = z.object({
  clientId: z.string().min(1),
  body: z.string().min(1, "Comment can't be empty"),
  mentionedUserIds: z.array(z.string()).default([]),
});

export async function addClientNote(input: z.infer<typeof addClientNoteSchema>) {
  const parsed = addClientNoteSchema.parse(input);
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: parsed.clientId },
    select: { name: true },
  });

  const note = await prisma.note.create({
    data: {
      clientId: parsed.clientId,
      body: parsed.body,
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  for (const userId of new Set(parsed.mentionedUserIds)) {
    await notify(
      {
        userId,
        type: "MENTIONED",
        message: `${session.user.name} mentioned you in "${client.name}"`,
        entityType: "Client",
        entityId: parsed.clientId,
      },
      session.user.id
    );
  }

  revalidatePath(`/clients/${parsed.clientId}`);
  return note;
}
