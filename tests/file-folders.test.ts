import { afterAll, beforeAll, describe, expect, it } from "vitest";

// File folders (docs/file-management-plan.md): the tree rules in
// src/lib/file-folders.ts — one owner per tree, unique sibling names,
// no cycles, deleting a folder never deletes files.

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import {
  createFolder,
  deleteFolder,
  ensureFolderPaths,
  listFolders,
  moveFiles,
  moveFolder,
  renameFolder,
  resolveFolderId,
  type FolderOwner,
} from "@/lib/file-folders";

const ORG = { id: "org_folders", slug: "folders-co", name: "Folders Co" };
const OTHER = { id: "org_folders_other", slug: "folders-other", name: "Other Co" };
const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);

let actor = "";
let client: FolderOwner;
let otherClient: FolderOwner;
let app: FolderOwner;
let fileA = "";
let fileB = "";
let appFile = "";

async function addFile(t: ReturnType<typeof tenantDb>, data: { clientId?: string; applicationId?: string }, name: string) {
  return (
    await t.fileAsset.create({
      data: { ...data, fileName: name, storageKey: `org/test/${name}`, mimeType: "application/pdf", sizeBytes: 1, uploadedById: actor },
    })
  ).id;
}

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [ORG.id, OTHER.id] } } });
  await prisma.organization.create({ data: { ...ORG, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...OTHER, timezone: "UTC" } });
  forgetOrg(ORG.slug);
  forgetOrg(OTHER.slug);
  const t = tenantDb(ORG.id);
  actor = (await t.user.create({ data: { name: "Mo Manager", email: "mo@folders.test", passwordHash: "x", role: "MANAGER" } })).id;
  const c = await t.client.create({ data: { name: "Sunrise Care", createdById: actor } });
  const c2 = await t.client.create({ data: { name: "Moonrise Care", createdById: actor } });
  const a = await t.application.create({ data: { name: "Sunrise license", clientId: c.id, assignedUserId: actor, createdById: actor } });
  client = { kind: "client", id: c.id };
  otherClient = { kind: "client", id: c2.id };
  app = { kind: "application", id: a.id };
  fileA = await addFile(t, { clientId: c.id }, "w9.pdf");
  fileB = await addFile(t, { clientId: c.id }, "ein.pdf");
  appFile = await addFile(t, { applicationId: a.id }, "app.pdf");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("creating and renaming", () => {
  it("creates nested folders and refuses a duplicate sibling name, ignoring case", async () => {
    await inOrg(async () => {
      const licenses = await createFolder(client, null, "  Licenses  ", actor);
      expect(licenses).toMatchObject({ name: "Licenses", parentId: null, fileCount: 0 });
      await createFolder(client, licenses.id, "2026", actor);
      await expect(createFolder(client, null, "licenses", actor)).rejects.toThrow(/already a folder called/);
      // Same name is fine in another place, and on another owner.
      await createFolder(client, licenses.id, "Licenses", actor);
      await createFolder(otherClient, null, "Licenses", actor);
      await createFolder(app, null, "Licenses", actor);
    });
  });

  it("rejects bad names", async () => {
    await inOrg(async () => {
      await expect(createFolder(client, null, "   ", actor)).rejects.toThrow(/name/);
      await expect(createFolder(client, null, "a/b", actor)).rejects.toThrow(/can't contain/);
      await expect(createFolder(client, null, "..", actor)).rejects.toThrow(/usable/);
    });
  });

  it("won't put a folder under another owner's folder", async () => {
    await inOrg(async () => {
      const [theirs] = await listFolders(otherClient);
      await expect(createFolder(client, theirs.id, "Sneaky", actor)).rejects.toThrow(/no longer exists/);
      await expect(resolveFolderId(theirs.id, client)).rejects.toThrow(/no longer exists/);
    });
  });

  it("renames, with the same name check", async () => {
    await inOrg(async () => {
      const tax = await createFolder(client, null, "Tax", actor);
      await expect(renameFolder(client, tax.id, "LICENSES", actor)).rejects.toThrow(/already a folder/);
      await renameFolder(client, tax.id, "Tax forms", actor);
      expect((await listFolders(client)).find((f) => f.id === tax.id)?.name).toBe("Tax forms");
    });
  });
});

describe("moving", () => {
  it("moves files into a folder and back to the top level", async () => {
    await inOrg(async () => {
      const licenses = (await listFolders(client)).find((f) => f.name === "Licenses" && f.parentId === null)!;
      expect(await moveFiles(client, [fileA, fileB], licenses.id, actor)).toBe(2);
      expect((await listFolders(client)).find((f) => f.id === licenses.id)?.fileCount).toBe(2);
      await moveFiles(client, [fileB], null, actor);
      const b = await tenantDb(ORG.id).fileAsset.findUniqueOrThrow({ where: { id: fileB } });
      expect(b.folderId).toBeNull();
    });
  });

  it("won't move another owner's file", async () => {
    await inOrg(async () => {
      await expect(moveFiles(client, [appFile], null, actor)).rejects.toThrow(/gone/);
    });
  });

  it("won't move a folder inside itself or its own subfolder", async () => {
    await inOrg(async () => {
      const folders = await listFolders(client);
      const licenses = folders.find((f) => f.name === "Licenses" && f.parentId === null)!;
      const y2026 = folders.find((f) => f.name === "2026")!;
      await expect(moveFolder(client, licenses.id, licenses.id, actor)).rejects.toThrow(/inside itself/);
      await expect(moveFolder(client, licenses.id, y2026.id, actor)).rejects.toThrow(/inside itself/);
      const tax = folders.find((f) => f.name === "Tax forms")!;
      await moveFolder(client, tax.id, licenses.id, actor);
      expect((await listFolders(client)).find((f) => f.id === tax.id)?.parentId).toBe(licenses.id);
    });
  });
});

describe("deleting", () => {
  it("moves the folder's files and subfolders up, renaming a clashing subfolder", async () => {
    await inOrg(async () => {
      const folders = await listFolders(client);
      const licenses = folders.find((f) => f.name === "Licenses" && f.parentId === null)!;
      // Licenses holds 2026, an inner "Licenses", Tax forms and w9.pdf.
      await deleteFolder(client, licenses.id, actor);
      const after = await listFolders(client);
      expect(after.find((f) => f.id === licenses.id)).toBeUndefined();
      const top = after.filter((f) => f.parentId === null).map((f) => f.name).sort();
      expect(top).toEqual(["2026", "Licenses", "Tax forms"]);
      const a = await tenantDb(ORG.id).fileAsset.findUniqueOrThrow({ where: { id: fileA } });
      expect(a.folderId).toBeNull(); // still there, now at the top
    });
  });

  it("renames a clashing subfolder to Name (2)", async () => {
    await inOrg(async () => {
      const outer = await createFolder(client, null, "Outer", actor);
      await createFolder(client, outer.id, "2026", actor);
      await deleteFolder(client, outer.id, actor);
      const top = (await listFolders(client)).filter((f) => f.parentId === null).map((f) => f.name);
      expect(top).toContain("2026 (2)");
    });
  });
});

describe("folder uploads", () => {
  it("creates missing folders along each path and reuses existing ones", async () => {
    await inOrg(async () => {
      const before = (await listFolders(client)).length;
      const ids = await ensureFolderPaths(client, null, ["Agreements", "Agreements/Signed", "tax forms/2025", "Agreements/Signed"], actor);
      expect(Object.keys(ids).sort()).toEqual(["Agreements", "Agreements/Signed", "tax forms/2025"]);
      const after = await listFolders(client);
      // Agreements, Signed, 2025 are new; "tax forms" matched "Tax forms".
      expect(after.length).toBe(before + 3);
      const taxForms = after.find((f) => f.name === "Tax forms")!;
      expect(after.find((f) => f.id === ids["tax forms/2025"])?.parentId).toBe(taxForms.id);
      expect(after.find((f) => f.id === ids["Agreements/Signed"])?.parentId).toBe(ids["Agreements"]);
    });
  });
});

describe("tenancy", () => {
  it("another org can't see or use these folders", async () => {
    const [mine] = await inOrg(() => listFolders(client));
    await runAsTenant(OTHER, async () => {
      expect(await listFolders(client)).toEqual([]);
      await expect(resolveFolderId(mine.id, client)).rejects.toThrow(/no longer exists/);
    });
  });
});
