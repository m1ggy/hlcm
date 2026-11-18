import { db, type TenantTx } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";

// Folders on a client's or an application's files (docs/file-management-plan.md).
//
// Storage keys are flat (org/<org>/<uuid>), so a folder is only a FileFolder
// row and moving a file only changes FileAsset.folderId — nothing in the
// bucket moves. Every folder, its parent and its files belong to one owner;
// nothing here moves anything across owners, because each owner has its own
// access check (assertApplicationAccess vs the client role gate).
//
// Access is the caller's job (src/lib/actions/folders.ts); these functions
// keep the tree consistent: one owner, no cycles, unique sibling names
// (ignoring case), checked under a per-owner advisory lock so two people
// creating "Licenses" at the same moment don't both succeed.

export type FolderOwner = { kind: "client"; id: string } | { kind: "application"; id: string };

export type FolderRow = {
  id: string;
  parentId: string | null;
  name: string;
  fileCount: number;
};

const MAX_NAME = 120;
const MAX_DEPTH = 20;

function ownerWhere(owner: FolderOwner) {
  return owner.kind === "client" ? { clientId: owner.id } : { applicationId: owner.id };
}

function ownerOf(row: { clientId: string | null; applicationId: string | null }): FolderOwner | null {
  if (row.clientId) return { kind: "client", id: row.clientId };
  if (row.applicationId) return { kind: "application", id: row.applicationId };
  return null;
}

function sameOwner(a: FolderOwner | null, b: FolderOwner) {
  return a !== null && a.kind === b.kind && a.id === b.id;
}

function auditEntity(owner: FolderOwner) {
  return { entityType: owner.kind === "client" ? "Client" : "Application", entityId: owner.id };
}

/** Trims and checks a folder name; throws a UserFacingError if it can't be one. */
export function cleanFolderName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new UserFacingError("Give the folder a name");
  if (name.length > MAX_NAME) throw new UserFacingError(`Folder names can be up to ${MAX_NAME} characters`);
  if (/[/\\]/.test(name)) throw new UserFacingError("Folder names can't contain / or \\");
  if (name === "." || name === "..") throw new UserFacingError("That isn't a usable folder name");
  return name;
}

/** Same rules for a file's name, minus the folder wording. */
export function cleanFileName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new UserFacingError("Give the file a name");
  if (name.length > 255) throw new UserFacingError("File names can be up to 255 characters");
  if (/[/\\]/.test(name)) throw new UserFacingError("File names can't contain / or \\");
  return name;
}

async function lockOwner(tx: TenantTx, owner: FolderOwner) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`file_folders:${owner.kind}:${owner.id}`}))`;
}

async function assertNameFree(tx: TenantTx, owner: FolderOwner, parentId: string | null, name: string, exceptId?: string) {
  const clash = await tx.fileFolder.findFirst({
    where: {
      ...ownerWhere(owner),
      parentId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (clash) throw new UserFacingError(`There's already a folder called "${name}" here`);
}

/** A sibling name that doesn't clash: "Name", then "Name (2)", "Name (3)"… */
async function freeName(tx: TenantTx, owner: FolderOwner, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await tx.fileFolder.findMany({
    where: { ...ownerWhere(owner), parentId, ...(exceptId && { id: { not: exceptId } }) },
    select: { name: true },
  });
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Loads a folder and checks it belongs to `owner`; null id = top level. */
async function folderInOwner(tx: TenantTx | typeof db, owner: FolderOwner, folderId: string | null) {
  if (folderId === null) return null;
  const folder = await tx.fileFolder.findUnique({
    where: { id: folderId },
    select: { id: true, parentId: true, name: true, clientId: true, applicationId: true },
  });
  if (!folder || !sameOwner(ownerOf(folder), owner)) {
    throw new UserFacingError("That folder no longer exists");
  }
  return folder;
}

/** Depth of a folder (top-level folder = 1) and its chain of ancestor ids. */
async function ancestry(tx: TenantTx, folderId: string | null) {
  const chain: string[] = [];
  let cursor = folderId;
  while (cursor) {
    chain.push(cursor);
    if (chain.length > MAX_DEPTH + 1) break;
    const row: { parentId: string | null } | null = await tx.fileFolder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
  return chain;
}

/** Looks up which owner a folder belongs to — for the action layer's access check. */
export async function getFolderOwner(folderId: string): Promise<FolderOwner> {
  const folder = await db.fileFolder.findUnique({ where: { id: folderId }, select: { clientId: true, applicationId: true } });
  const owner = folder && ownerOf(folder);
  if (!owner) throw new UserFacingError("That folder no longer exists");
  return owner;
}

/**
 * For the upload actions: a `folderId` form value, checked against the file's
 * owner before anything goes to storage. Empty = top level.
 */
export async function resolveFolderId(raw: FormDataEntryValue | string | null | undefined, owner: FolderOwner) {
  if (typeof raw !== "string" || raw === "") return null;
  const folder = await folderInOwner(db, owner, raw);
  return folder?.id ?? null;
}

export async function listFolders(owner: FolderOwner): Promise<FolderRow[]> {
  const folders = await db.fileFolder.findMany({
    where: ownerWhere(owner),
    select: { id: true, parentId: true, name: true, _count: { select: { files: true } } },
    orderBy: { name: "asc" },
  });
  return folders.map(({ _count, ...f }) => ({ ...f, fileCount: _count.files }));
}

export async function createFolder(owner: FolderOwner, parentId: string | null, rawName: string, actorId: string) {
  const name = cleanFolderName(rawName);
  const folder = await db.$transaction(async (tx) => {
    await lockOwner(tx, owner);
    await folderInOwner(tx, owner, parentId);
    if ((await ancestry(tx, parentId)).length >= MAX_DEPTH) {
      throw new UserFacingError(`Folders can only go ${MAX_DEPTH} levels deep`);
    }
    await assertNameFree(tx, owner, parentId, name);
    return tx.fileFolder.create({
      data: { ...ownerWhere(owner), parentId, name, createdById: actorId },
      select: { id: true, parentId: true, name: true },
    });
  });
  await recordAudit({ ...auditEntity(owner), action: "create_folder", actorId, field: "folder", newValue: name });
  return { ...folder, fileCount: 0 } satisfies FolderRow;
}

export async function renameFolder(owner: FolderOwner, folderId: string, rawName: string, actorId: string) {
  const name = cleanFolderName(rawName);
  const before = await db.$transaction(async (tx) => {
    await lockOwner(tx, owner);
    const folder = await folderInOwner(tx, owner, folderId);
    if (!folder) throw new UserFacingError("That folder no longer exists");
    await assertNameFree(tx, owner, folder.parentId, name, folderId);
    await tx.fileFolder.update({ where: { id: folderId }, data: { name } });
    return folder.name;
  });
  if (before !== name) {
    await recordAudit({ ...auditEntity(owner), action: "rename_folder", actorId, field: "folder", oldValue: before, newValue: name });
  }
}

export async function moveFolder(owner: FolderOwner, folderId: string, newParentId: string | null, actorId: string) {
  const moved = await db.$transaction(async (tx) => {
    await lockOwner(tx, owner);
    const folder = await folderInOwner(tx, owner, folderId);
    if (!folder) throw new UserFacingError("That folder no longer exists");
    if (folder.parentId === newParentId) return null;
    await folderInOwner(tx, owner, newParentId);
    const chain = await ancestry(tx, newParentId);
    if (chain.includes(folderId)) throw new UserFacingError("A folder can't go inside itself");
    // The deepest folder under the one being moved decides whether it fits.
    const subtreeDepth = await deepestBelow(tx, owner, folderId);
    if (chain.length + subtreeDepth > MAX_DEPTH) {
      throw new UserFacingError(`Folders can only go ${MAX_DEPTH} levels deep`);
    }
    await assertNameFree(tx, owner, newParentId, folder.name, folderId);
    await tx.fileFolder.update({ where: { id: folderId }, data: { parentId: newParentId } });
    return folder.name;
  });
  if (moved) await recordAudit({ ...auditEntity(owner), action: "move_folder", actorId, field: "folder", newValue: moved });
}

// 1 = the folder alone, 2 = it has subfolders, …
async function deepestBelow(tx: TenantTx, owner: FolderOwner, folderId: string) {
  const all = await tx.fileFolder.findMany({ where: ownerWhere(owner), select: { id: true, parentId: true } });
  const kids = new Map<string, string[]>();
  for (const f of all) if (f.parentId) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f.id]);
  const depth = (id: string, guard: number): number =>
    guard > MAX_DEPTH + 1 ? guard : 1 + Math.max(0, ...(kids.get(id) ?? []).map((k) => depth(k, guard + 1)));
  return depth(folderId, 1);
}

/**
 * Deletes a folder without deleting anything in it: its files and subfolders
 * move up to its parent. A subfolder whose name is already taken there gets
 * " (2)" added. Files are never deleted by removing a folder.
 */
export async function deleteFolder(owner: FolderOwner, folderId: string, actorId: string) {
  const name = await db.$transaction(async (tx) => {
    await lockOwner(tx, owner);
    const folder = await folderInOwner(tx, owner, folderId);
    if (!folder) throw new UserFacingError("That folder no longer exists");
    await tx.fileAsset.updateMany({ where: { folderId }, data: { folderId: folder.parentId } });
    const children = await tx.fileFolder.findMany({ where: { parentId: folderId }, select: { id: true, name: true } });
    for (const child of children) {
      // The folder being deleted doesn't count as a clash.
      const childName = await freeName(tx, owner, folder.parentId, child.name, folderId);
      await tx.fileFolder.update({ where: { id: child.id }, data: { parentId: folder.parentId, name: childName } });
    }
    await tx.fileFolder.delete({ where: { id: folderId } });
    return folder.name;
  });
  await recordAudit({ ...auditEntity(owner), action: "delete_folder", actorId, field: "folder", oldValue: name });
}

/** Moves files (all of this owner's) into a folder, or to the top level with null. */
export async function moveFiles(owner: FolderOwner, fileIds: string[], folderId: string | null, actorId: string) {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return 0;
  if (ids.length > 500) throw new UserFacingError("Move up to 500 files at a time");
  const files = await db.$transaction(async (tx) => {
    await lockOwner(tx, owner);
    const target = await folderInOwner(tx, owner, folderId);
    const found = await tx.fileAsset.findMany({
      where: { id: { in: ids }, ...ownerWhere(owner), correspondenceId: null },
      select: { id: true, fileName: true },
    });
    if (found.length !== ids.length) throw new UserFacingError("Some of those files are gone — refresh and try again");
    await tx.fileAsset.updateMany({ where: { id: { in: ids } }, data: { folderId: target?.id ?? null } });
    return { found, targetName: target?.name ?? "Files" };
  });
  await recordAudit({
    ...auditEntity(owner),
    action: "move_files",
    actorId,
    field: "file",
    newValue: `${files.found.map((f) => f.fileName).join(", ")} → ${files.targetName}`,
  });
  return files.found.length;
}

/**
 * Makes sure each slash-separated path exists under `baseFolderId` (creating
 * what's missing — "Licenses/2026" makes both) and returns path → folder id.
 * Used by folder uploads; existing folders are reused by name, ignoring case.
 */
export async function ensureFolderPaths(
  owner: FolderOwner,
  baseFolderId: string | null,
  paths: string[],
  actorId: string
): Promise<Record<string, string>> {
  if (paths.length > 1000) throw new UserFacingError("That's too many folders to upload at once");
  const split = [...new Set(paths)].map((p) => ({ path: p, parts: p.split("/").filter(Boolean).map(cleanFolderName) }));
  const created: string[] = [];
  const result = await db.$transaction(
    async (tx) => {
      await lockOwner(tx, owner);
      await folderInOwner(tx, owner, baseFolderId);
      const baseDepth = (await ancestry(tx, baseFolderId)).length;
      const existing = await tx.fileFolder.findMany({ where: ownerWhere(owner), select: { id: true, parentId: true, name: true } });
      const byKey = new Map(existing.map((f) => [`${f.parentId ?? ""}/${f.name.toLowerCase()}`, f.id]));
      const out: Record<string, string> = {};
      for (const { path, parts } of split) {
        if (parts.length === 0) continue;
        if (baseDepth + parts.length > MAX_DEPTH) throw new UserFacingError(`Folders can only go ${MAX_DEPTH} levels deep`);
        let parent = baseFolderId;
        for (const part of parts) {
          const key = `${parent ?? ""}/${part.toLowerCase()}`;
          let id = byKey.get(key);
          if (!id) {
            const row = await tx.fileFolder.create({
              data: { ...ownerWhere(owner), parentId: parent, name: part, createdById: actorId },
              select: { id: true },
            });
            id = row.id;
            byKey.set(key, id);
            created.push(part);
          }
          parent = id;
        }
        out[path] = parent!;
      }
      return out;
    },
    { timeout: 30_000 }
  );
  if (created.length > 0) {
    await recordAudit({ ...auditEntity(owner), action: "create_folder", actorId, field: "folder", newValue: created.join(", ") });
  }
  return result;
}
