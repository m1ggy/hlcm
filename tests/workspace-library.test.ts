import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A client workspace's file library (docs/file-management-plan.md,
// src/lib/workspace-library.ts): one folder tree per workspace, separate
// from task attachments; office staff and the managing company's team, not
// caregivers; tasks-only workspaces only.

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/storage", () => ({
  saveUploadedFile: vi.fn(async () => ({ storageKey: "org/test/library.pdf", sizeBytes: 3, generation: BigInt(1) })),
  deleteStoredFile: vi.fn(async () => {}),
}));
const sessionUser = vi.hoisted(() => ({ current: { id: "", role: "STAFF" } }));
// Not importOriginal — the real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => {
  class ForbiddenError extends Error {}
  class UnauthorizedError extends Error {}
  const session = async () => ({ user: { ...sessionUser.current, name: "Tester" } });
  const isSuperuser = (r: string) => r === "OWNER" || r === "DEVELOPER";
  return {
    requireSession: session,
    requireRole: session,
    assertApplicationAccess: async () => {},
    isSuperuser,
    isAdmin: (r: string) => isSuperuser(r) || r === "ADMIN" || r === "ACCOUNTANT",
    isManagement: (r: string) => isSuperuser(r) || ["ADMIN", "ACCOUNTANT", "MANAGER"].includes(r),
    ForbiddenError,
    UnauthorizedError,
  };
});

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { createFolder, listFolders, moveFiles, LIBRARY_ID, type FolderOwner } from "@/lib/file-folders";
import { deleteLibraryFile, listLibraryFiles, uploadLibraryFile } from "@/lib/actions/files";
import { canUseLibrary } from "@/lib/workspace-library";

const CLIENT = { id: "org_lib_client", slug: "lib-client", name: "Client Co" };
const FULL = { id: "org_lib_full", slug: "lib-full", name: "Licensing Co" };
const library: FolderOwner = { kind: "library", id: LIBRARY_ID };
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);
const ids: Record<string, string> = {};

function form(name: string, folderId?: string) {
  const f = new FormData();
  f.set("file", new File(["abc"], name, { type: "application/pdf" }));
  if (folderId) f.set("folderId", folderId);
  return f;
}

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, FULL.id] } } });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", timezone: "UTC" } });
  await prisma.organization.create({ data: { ...FULL, timezone: "UTC" } });
  for (const o of [CLIENT, FULL]) forgetOrg(o.slug);
  const c = tenantDb(CLIENT.id);
  ids.staff = (await c.user.create({ data: { name: "Sam Staff", email: "sam@lib.test", passwordHash: "x", role: "STAFF" } })).id;
  ids.caregiver = (await c.user.create({ data: { name: "Cara Giver", passwordHash: "x", role: "CAREGIVER" } })).id;
  const f = tenantDb(FULL.id);
  ids.fullStaff = (await f.user.create({ data: { name: "Fay Full", email: "fay@lib.test", passwordHash: "x", role: "STAFF" } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("workspace file library", () => {
  it("is for a client workspace's office staff and team, not caregivers or licensing workspaces", () => {
    expect(canUseLibrary("STAFF", "TASKS")).toBe(true);
    expect(canUseLibrary("OWNER", "TASKS")).toBe(true);
    expect(canUseLibrary("CAREGIVER", "TASKS")).toBe(false);
    expect(canUseLibrary("CLIENT", "TASKS")).toBe(false);
    expect(canUseLibrary("ADMIN", "FULL")).toBe(false);
  });

  it("uploads into folders, lists, and keeps library files apart from everything else", async () => {
    sessionUser.current = { id: ids.staff, role: "STAFF" };
    const folder = await inClient(() => createFolder(library, null, "Policies", ids.staff));
    const result = await inClient(() => uploadLibraryFile("x", form("handbook.pdf", folder.id)));
    expect(result.ok).toBe(true);
    const files = await inClient(() => listLibraryFiles());
    expect(files.map((f) => [f.fileName, f.folderId])).toEqual([["handbook.pdf", folder.id]]);
    expect((await inClient(() => listFolders(library))).map((f) => f.name)).toEqual(["Policies"]);

    // Moving and deleting stay inside the library.
    await inClient(() => moveFiles(library, [files[0].id], null, ids.staff));
    expect((await inClient(() => listLibraryFiles()))[0].folderId).toBeNull();
    const del = await inClient(() => deleteLibraryFile(files[0].id));
    expect(del.ok).toBe(true);
    expect(await inClient(() => listLibraryFiles())).toEqual([]);
  });

  it("refuses caregivers and licensing workspaces", async () => {
    sessionUser.current = { id: ids.caregiver, role: "CAREGIVER" };
    await expect(inClient(() => listLibraryFiles())).rejects.toThrow();
    sessionUser.current = { id: ids.fullStaff, role: "STAFF" };
    await expect(runAsTenant(FULL, () => listLibraryFiles())).rejects.toThrow();
  });

  it("a folder has exactly one owner", async () => {
    const c = tenantDb(CLIENT.id);
    const client = await c.client.create({ data: { name: "Somebody", createdById: ids.staff } });
    await expect(c.fileFolder.create({ data: { library: true, clientId: client.id, name: "Both", createdById: ids.staff } })).rejects.toThrow();
  });
});
