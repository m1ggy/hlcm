"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess, ForbiddenError, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile, saveFileVersion, revertToGeneration } from "@/lib/storage";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep well under bodySizeLimit's 25MB

async function assertCanAccessTask(
  session: Awaited<ReturnType<typeof requireSession>>,
  task: { applicationId: string | null; createdById: string; assignees: { userId: string }[] },
  level: "view" | "edit"
) {
  if (task.applicationId) {
    await assertApplicationAccess(session, task.applicationId, level);
    return;
  }
  const role = session.user.role as AppRole;
  if (role === "ADMIN" || role === "MANAGER") return;
  const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
  if (!isAssignee && task.createdById !== session.user.id) {
    throw new ForbiddenError("Not your task");
  }
}

async function assertCanAccessFileAsset(
  session: Awaited<ReturnType<typeof requireSession>>,
  asset: {
    applicationId: string | null;
    task: { applicationId: string | null; createdById: string; assignees: { userId: string }[] } | null;
  },
  level: "view" | "edit"
) {
  if (asset.applicationId) {
    await assertApplicationAccess(session, asset.applicationId, level);
    return;
  }
  if (asset.task) {
    await assertCanAccessTask(session, asset.task, level);
    return;
  }
  throw new ForbiddenError("Not accessible");
}

// Signed PDFs (SignatureEvent points at exact page/ratio coordinates on this
// file's current bytes) can't be re-versioned — overwriting or reverting the
// object would silently invalidate where the signature was flattened.
function assertNotSigned(asset: { signatureEvents: { id: string }[] }) {
  if (asset.signatureEvents.length > 0) {
    throw new Error("This file has been signed and can't have new versions");
  }
}

function revalidateForAsset(asset: { applicationId: string | null; task: { applicationId: string | null } | null }) {
  if (asset.applicationId) revalidatePath(`/applications/${asset.applicationId}`);
  else if (asset.task?.applicationId) revalidatePath(`/applications/${asset.task.applicationId}`);
  else revalidatePath("/tasks");
}

export async function listFiles(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  const assets = await prisma.fileAsset.findMany({
    where: { applicationId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { versions: true, signatureEvents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(({ _count, ...asset }) => ({
    ...asset,
    versionCount: _count.versions,
    isSigned: _count.signatureEvents > 0,
  }));
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

  const { storageKey, sizeBytes, generation } = await saveUploadedFile(file);
  const mimeType = file.type || "application/octet-stream";

  const asset = await prisma.fileAsset.create({
    data: {
      applicationId,
      fileName: file.name,
      storageKey,
      mimeType,
      sizeBytes,
      uploadedById: session.user.id,
      versions: {
        create: { version: 1, generation, fileName: file.name, mimeType, sizeBytes, uploadedById: session.user.id },
      },
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
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
  await assertCanAccessTask(session, task, "view");

  const assets = await prisma.fileAsset.findMany({
    where: { taskId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      _count: { select: { versions: true, signatureEvents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(({ _count, ...asset }) => ({
    ...asset,
    versionCount: _count.versions,
    isSigned: _count.signatureEvents > 0,
  }));
}

export async function uploadTaskFile(taskId: string, formData: FormData) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
  await assertCanAccessTask(session, task, "edit");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 20MB");
  }

  const { storageKey, sizeBytes, generation } = await saveUploadedFile(file);
  const mimeType = file.type || "application/octet-stream";

  const asset = await prisma.fileAsset.create({
    data: {
      taskId,
      fileName: file.name,
      storageKey,
      mimeType,
      sizeBytes,
      uploadedById: session.user.id,
      versions: {
        create: { version: 1, generation, fileName: file.name, mimeType, sizeBytes, uploadedById: session.user.id },
      },
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
  return { ...asset, versionCount: 1, isSigned: false };
}

export async function deleteTaskFile(fileId: string, taskId: string) {
  const session = await requireSession();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: { select: { userId: true } } },
  });
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

export async function listFileVersions(fileId: string) {
  const session = await requireSession();
  const asset = await prisma.fileAsset.findUniqueOrThrow({
    where: { id: fileId },
    include: { task: { include: { assignees: { select: { userId: true } } } } },
  });
  await assertCanAccessFileAsset(session, asset, "view");

  return prisma.fileVersion.findMany({
    where: { fileAssetId: fileId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { version: "desc" },
  });
}

export async function uploadNewFileVersion(fileId: string, formData: FormData) {
  const session = await requireSession();
  const asset = await prisma.fileAsset.findUniqueOrThrow({
    where: { id: fileId },
    include: { task: { include: { assignees: { select: { userId: true } } } }, signatureEvents: { select: { id: true } } },
  });
  await assertCanAccessFileAsset(session, asset, "edit");
  assertNotSigned(asset);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 20MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const { generation } = await saveFileVersion(asset.storageKey, buffer, mimeType);

  const latest = await prisma.fileVersion.findFirst({ where: { fileAssetId: fileId }, orderBy: { version: "desc" } });
  const nextVersion = (latest?.version ?? 0) + 1;

  const [, updated] = await prisma.$transaction([
    prisma.fileVersion.create({
      data: {
        fileAssetId: fileId,
        version: nextVersion,
        generation,
        fileName: file.name,
        mimeType,
        sizeBytes: buffer.byteLength,
        uploadedById: session.user.id,
      },
    }),
    prisma.fileAsset.update({
      where: { id: fileId },
      data: { fileName: file.name, mimeType, sizeBytes: buffer.byteLength },
      include: { uploadedBy: { select: { id: true, name: true } } },
    }),
  ]);

  const entityType = asset.applicationId ? "Application" : "Task";
  const entityId = asset.applicationId ?? asset.taskId!;
  await recordAudit({
    entityType,
    entityId,
    action: "upload_file_version",
    actorId: session.user.id,
    field: "file",
    newValue: `${file.name} (v${nextVersion})`,
  });

  revalidateForAsset(asset);
  return updated;
}

export async function revertFileVersion(fileId: string, versionId: string) {
  const session = await requireSession();
  const asset = await prisma.fileAsset.findUniqueOrThrow({
    where: { id: fileId },
    include: { task: { include: { assignees: { select: { userId: true } } } }, signatureEvents: { select: { id: true } } },
  });
  await assertCanAccessFileAsset(session, asset, "edit");
  assertNotSigned(asset);

  const target = await prisma.fileVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (target.fileAssetId !== fileId) throw new ForbiddenError("Version does not belong to this file");

  const { generation } = await revertToGeneration(asset.storageKey, target.generation);

  const latest = await prisma.fileVersion.findFirst({ where: { fileAssetId: fileId }, orderBy: { version: "desc" } });
  const nextVersion = (latest?.version ?? 0) + 1;

  const [, updated] = await prisma.$transaction([
    prisma.fileVersion.create({
      data: {
        fileAssetId: fileId,
        version: nextVersion,
        generation,
        fileName: target.fileName,
        mimeType: target.mimeType,
        sizeBytes: target.sizeBytes,
        uploadedById: session.user.id,
      },
    }),
    prisma.fileAsset.update({
      where: { id: fileId },
      data: { fileName: target.fileName, mimeType: target.mimeType, sizeBytes: target.sizeBytes },
      include: { uploadedBy: { select: { id: true, name: true } } },
    }),
  ]);

  const entityType = asset.applicationId ? "Application" : "Task";
  const entityId = asset.applicationId ?? asset.taskId!;
  await recordAudit({
    entityType,
    entityId,
    action: "revert_file_version",
    actorId: session.user.id,
    field: "file",
    oldValue: asset.fileName,
    newValue: `reverted to v${target.version} (now v${nextVersion})`,
  });

  revalidateForAsset(asset);
  return updated;
}
