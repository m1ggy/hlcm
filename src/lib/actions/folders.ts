"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireSession, assertApplicationAccess, type AppRole } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import {
  createFolder,
  deleteFolder,
  ensureFolderPaths,
  getFolderOwner,
  listFolders,
  moveFiles,
  moveFolder,
  renameFolder,
  type FolderOwner,
} from "@/lib/file-folders";

// Folder actions for client and application files (docs/file-management-plan.md).
// The access rule is the one the owner's files already use: application
// files go through assertApplicationAccess, client files through the same
// role gate as listClientFiles/uploadClientFile in files.ts. The tree rules
// live in src/lib/file-folders.ts.

const CLIENT_FILE_ROLES: AppRole[] = ["ADMIN", "MANAGER", "STAFF"];

async function authorize(owner: FolderOwner, level: "view" | "edit") {
  if (owner.kind === "client") return requireRole(CLIENT_FILE_ROLES);
  const session = await requireSession();
  await assertApplicationAccess(session, owner.id, level);
  return session;
}

function revalidateOwner(owner: FolderOwner) {
  revalidatePath(owner.kind === "client" ? `/clients/${owner.id}` : `/applications/${owner.id}`);
}

function parseOwner(owner: FolderOwner): FolderOwner {
  if ((owner?.kind !== "client" && owner?.kind !== "application") || typeof owner.id !== "string" || !owner.id) {
    throw new Error("Bad folder owner");
  }
  return { kind: owner.kind, id: owner.id };
}

export async function listFoldersAction(rawOwner: FolderOwner) {
  const owner = parseOwner(rawOwner);
  await authorize(owner, "view");
  return listFolders(owner);
}

export async function createFolderAction(rawOwner: FolderOwner, parentId: string | null, name: string) {
  return toActionResult(async () => {
    const owner = parseOwner(rawOwner);
    const session = await authorize(owner, "edit");
    const folder = await createFolder(owner, parentId, name, session.user.id);
    revalidateOwner(owner);
    return folder;
  });
}

export async function renameFolderAction(folderId: string, name: string) {
  return toActionResult(async () => {
    const owner = await getFolderOwner(folderId);
    const session = await authorize(owner, "edit");
    await renameFolder(owner, folderId, name, session.user.id);
    revalidateOwner(owner);
  });
}

export async function moveFolderAction(folderId: string, newParentId: string | null) {
  return toActionResult(async () => {
    const owner = await getFolderOwner(folderId);
    const session = await authorize(owner, "edit");
    await moveFolder(owner, folderId, newParentId, session.user.id);
    revalidateOwner(owner);
  });
}

export async function deleteFolderAction(folderId: string) {
  return toActionResult(async () => {
    const owner = await getFolderOwner(folderId);
    const session = await authorize(owner, "edit");
    await deleteFolder(owner, folderId, session.user.id);
    revalidateOwner(owner);
  });
}

export async function moveFilesAction(rawOwner: FolderOwner, fileIds: string[], folderId: string | null) {
  return toActionResult(async () => {
    const owner = parseOwner(rawOwner);
    const session = await authorize(owner, "edit");
    const moved = await moveFiles(owner, fileIds, folderId, session.user.id);
    revalidateOwner(owner);
    return moved;
  });
}

/** Folder uploads: creates the dropped folder structure, returns path → folder id. */
export async function ensureFolderPathsAction(rawOwner: FolderOwner, baseFolderId: string | null, paths: string[]) {
  return toActionResult(async () => {
    const owner = parseOwner(rawOwner);
    const session = await authorize(owner, "edit");
    const ids = await ensureFolderPaths(owner, baseFolderId, paths, session.user.id);
    revalidateOwner(owner);
    return ids;
  });
}
