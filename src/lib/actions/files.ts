"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess, ForbiddenError, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep well under bodySizeLimit's 25MB

async function assertCanAccessTask(
  session: Awaited<ReturnType<typeof requireSession>>,
  task: { applicationId: string | null; assignedUserId: string; createdById: string },
  level: "view" | "edit"
) {
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, level);
    return;
  }
  const role = session.user.role as AppRole;
  if (role === "ADMIN" || role === "MANAGER") return;
  if (task.assignedUserId !== session.user.id && task.createdById !== session.user.id) {
    throw new ForbiddenError("Not your task");
  }
}

export async function listFiles(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  return prisma.fileAsset.findMany({
    where: { applicationId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function uploadFile(applicationId: string, formData: FormData) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 20MB");
  }

  const { storageKey, sizeBytes } = await saveUploadedFile(file);

  const asset = await prisma.fileAsset.create({
    data: {
      applicationId,
      fileName: file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      uploadedById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "upload_file",
    actorId: session.user.id,
    field: "file",
    newValue: file.name,
  });

  revalidatePath(`/applications/${applicationId}`);
  return asset;
}

export async function deleteFile(fileId: string, applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: fileId } });
  await prisma.fileAsset.delete({ where: { id: fileId } });
  await deleteStoredFile(asset.storageKey);

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "delete_file",
    actorId: session.user.id,
    field: "file",
    oldValue: asset.fileName,
  });

  revalidatePath(`/applications/${applicationId}`);
}

export async function listTaskFiles(taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanAccessTask(session, task, "view");

  return prisma.fileAsset.findMany({
    where: { taskId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function uploadTaskFile(taskId: string, formData: FormData) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanAccessTask(session, task, "edit");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 20MB");
  }

  const { storageKey, sizeBytes } = await saveUploadedFile(file);

  const asset = await prisma.fileAsset.create({
    data: {
      taskId,
      fileName: file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    entityType: "Task",
    entityId: taskId,
    action: "upload_file",
    actorId: session.user.id,
    field: "file",
    newValue: file.name,
  });

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
  return asset;
}

export async function deleteTaskFile(fileId: string, taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  await assertCanAccessTask(session, task, "edit");

  const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: fileId } });
  await prisma.fileAsset.delete({ where: { id: fileId } });
  await deleteStoredFile(asset.storageKey);

  await recordAudit({
    entityType: "Task",
    entityId: taskId,
    action: "delete_file",
    actorId: session.user.id,
    field: "file",
    oldValue: asset.fileName,
  });

  if (task.applicationId) revalidatePath(`/applications/${task.applicationId}`);
  else revalidatePath("/tasks");
}
