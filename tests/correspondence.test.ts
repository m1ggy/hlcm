import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Correspondence (docs/client-portal-eod-plan.md, Phase B).

const storage = vi.hoisted(() => {
  let n = 0;
  return {
    saveUploadedFile: vi.fn(async (file: File) => ({ storageKey: `org/test/${++n}-${file.name}`, sizeBytes: file.size, generation: BigInt(1) })),
    deleteStoredFile: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/storage", () => storage);
// The real module pulls in next-auth, which doesn't load outside Next — the
// same access rule, against the database: management edits everything,
// the owner edits theirs, grants give what they say.
vi.mock("@/lib/rbac", async () => {
  const { db } = await import("@/lib/db");
  const isManagement = (role: string | null | undefined) => ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER"].includes(role ?? "");
  return {
    isManagement,
    getApplicationAccessLevel: async (session: { user: { id: string; role: string } }, applicationId: string) => {
      if (isManagement(session.user.role)) return "edit";
      const app = await db.application.findUnique({ where: { id: applicationId }, select: { assignedUserId: true } });
      if (!app) return "none";
      if (app.assignedUserId === session.user.id) return "edit";
      const grant = await db.accessGrant.findUnique({ where: { applicationId_userId: { applicationId, userId: session.user.id } } });
      return grant ? (grant.permission === "EDIT" ? "edit" : "view") : "none";
    },
  };
});

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import {
  createCorrespondence,
  deleteCorrespondence,
  listCorrespondence,
  listLinkableCorrespondence,
  previewEmail,
  updateCorrespondence,
  type CorrActor,
} from "@/lib/correspondence";
import { saveDraft, startDay } from "@/lib/eod";

const ORG = { id: "org_corr", slug: "corr-co", name: "Corr Co" };
const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);

let owner: CorrActor; // owns the application
let manager: CorrActor;
let outsider: CorrActor; // STAFF, no access
let appId = "";
let clientId = "";
let taskId = "";

const EMAIL = [
  "From: Dana State <dana@state.example.gov>",
  "To: Val VA <val@corr.test>",
  "Subject: Inspection scheduled",
  "Date: Tue, 03 Nov 2026 15:30:00 +0000",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Your inspection is on November 12 at 10am.",
  "--b1",
  'Content-Type: application/pdf; name="notice.pdf"',
  'Content-Disposition: attachment; filename="notice.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("%PDF-1.4 fake").toString("base64"),
  "--b1--",
  "",
].join("\r\n");

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: { ...ORG, timezone: "UTC" } });
  forgetOrg(ORG.slug);
  const t = tenantDb(ORG.id);
  const mk = (name: string, role: "STAFF" | "MANAGER") =>
    t.user.create({ data: { name, email: `${name.toLowerCase().replace(" ", ".")}@corr.test`, passwordHash: "x", role } });
  const [o, m, x] = await Promise.all([mk("Val VA", "STAFF"), mk("Mo Manager", "MANAGER"), mk("Oz Outside", "STAFF")]);
  owner = { userId: o.id, role: "STAFF" };
  manager = { userId: m.id, role: "MANAGER" };
  outsider = { userId: x.id, role: "STAFF" };
  const client = await t.client.create({ data: { name: "Sunrise Care", createdById: m.id } });
  clientId = client.id;
  appId = (await t.application.create({ data: { name: "Sunrise license", clientId, assignedUserId: o.id, createdById: m.id } })).id;
  taskId = (await t.task.create({ data: { label: "Schedule inspection", applicationId: appId, createdById: m.id, assignees: { create: [{ userId: o.id }] } } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const input = { kind: "PHONE_CALL" as const, direction: "OUTBOUND" as const, subject: "Called the state", occurredAt: new Date("2026-11-02T14:00:00Z") };

describe("adding correspondence", () => {
  it("files an entry on an application with its attachments, kept out of the file pool", async () => {
    await inOrg(async () => {
      const shot = new File([new Uint8Array(5000)], "screenshot.png", { type: "image/png" });
      const entry = await createCorrespondence(owner, { applicationId: appId }, { ...input, body: "  Left a voicemail  " }, [shot]);
      expect(entry).toMatchObject({ applicationId: appId, taskId: null, clientId, subject: "Called the state", body: "Left a voicemail", clientVisible: false });
      expect(entry.attachments.map((a) => a.fileName)).toEqual(["screenshot.png"]);
      const asset = await tenantDb(ORG.id).fileAsset.findFirstOrThrow({ where: { correspondenceId: entry.id } });
      expect(asset.applicationId).toBe(appId); // so downloads keep the application's access check
      const audit = await tenantDb(ORG.id).auditLog.findFirst({ where: { entityType: "Application", entityId: appId, action: "add_correspondence" } });
      expect(audit?.newValue).toBe("Called the state");
    });
  });

  it("on a task carries the task's application and client", async () => {
    const entry = await inOrg(() => createCorrespondence(owner, { taskId }, { ...input, kind: "EMAIL", subject: "Sent the form", direction: "OUTBOUND" }));
    expect(entry).toMatchObject({ taskId, applicationId: appId, clientId });
    expect((await inOrg(() => listCorrespondence(owner, { taskId }))).map((e) => e.subject)).toEqual(["Sent the form"]);
    // The application's timeline includes it.
    expect((await inOrg(() => listCorrespondence(owner, { applicationId: appId }))).map((e) => e.subject)).toContain("Sent the form");
  });

  it("reads an .eml: its fields fill the gaps and its attachments are kept with the email itself", async () => {
    await inOrg(async () => {
      const eml = new File([EMAIL], "inspection.eml", { type: "message/rfc822" });
      const preview = await previewEmail(eml);
      expect(preview).toMatchObject({ subject: "Inspection scheduled", attachmentNames: ["notice.pdf"] });
      expect(preview.fromParty).toContain("dana@state.example.gov");
      const entry = await createCorrespondence(owner, { applicationId: appId }, { kind: "EMAIL", direction: "INBOUND" }, [], eml);
      expect(entry.subject).toBe("Inspection scheduled");
      expect(entry.toParty).toContain("val@corr.test");
      expect(entry.occurredAt.toISOString()).toBe("2026-11-03T15:30:00.000Z");
      expect(entry.body).toContain("November 12");
      expect(entry.attachments.map((a) => a.fileName).sort()).toEqual(["inspection.eml", "notice.pdf"]);
      await expect(previewEmail(new File(["hi"], "note.txt"))).rejects.toThrow(/isn't an email/);
    });
  });

  it("needs access to the parent, and is never for clients or caregivers", async () => {
    await inOrg(async () => {
      await expect(createCorrespondence(outsider, { applicationId: appId }, input)).rejects.toThrow(/Not found/);
      await expect(listCorrespondence(outsider, { taskId })).rejects.toThrow(/Not found/);
      await expect(listCorrespondence({ ...owner, role: "CLIENT" }, { applicationId: appId })).rejects.toThrow(/Not found/);
      await expect(createCorrespondence(owner, { applicationId: appId }, { ...input, subject: " " })).rejects.toThrow(/subject/);
      // View-only grant: can read, can't add.
      await tenantDb(ORG.id).accessGrant.create({ data: { applicationId: appId, userId: outsider.userId, permission: "VIEW", grantedById: manager.userId } });
      await expect(listCorrespondence(outsider, { applicationId: appId })).resolves.toBeTruthy();
      await expect(createCorrespondence(outsider, { applicationId: appId }, input)).rejects.toThrow(/Not found/);
    });
  });

  it("must belong to an application or a task (database check)", async () => {
    await expect(
      inOrg(() => tenantDb(ORG.id).correspondence.create({ data: { subject: "Orphan", occurredAt: new Date(), createdById: owner.userId } }))
    ).rejects.toThrow(/correspondence_has_parent/);
  });
});

describe("changing correspondence", () => {
  it("lets the author or a manager edit or delete, and removes stored files", async () => {
    await inOrg(async () => {
      const file = new File(["letter"], "letter.pdf", { type: "application/pdf" });
      const entry = await createCorrespondence(manager, { applicationId: appId }, { ...input, kind: "LETTER", subject: "Letter from the board" }, [file]);
      // The application's owner can edit the application, but this is the manager's entry.
      await expect(updateCorrespondence(owner, entry.id, { ...input, subject: "Mine now" })).rejects.toThrow(/Only whoever added it/);
      const edited = await updateCorrespondence(manager, entry.id, { ...input, kind: "LETTER", subject: "Board letter", clientVisible: true });
      expect(edited).toMatchObject({ subject: "Board letter", clientVisible: true });
      const key = edited.attachments.length ? (await tenantDb(ORG.id).fileAsset.findFirstOrThrow({ where: { correspondenceId: entry.id } })).storageKey : "";
      await deleteCorrespondence(manager, entry.id);
      expect(storage.deleteStoredFile).toHaveBeenCalledWith(key);
      expect(await tenantDb(ORG.id).fileAsset.count({ where: { correspondenceId: entry.id } })).toBe(0);
      expect(await tenantDb(ORG.id).correspondence.findUnique({ where: { id: entry.id } })).toBeNull();
    });
  });
});

describe("EOD links", () => {
  it("lets a line on a task point at that task's (or its application's) correspondence only", async () => {
    await inOrg(async () => {
      const onTask = await createCorrespondence(owner, { taskId }, { ...input, kind: "EMAIL", subject: "Follow-up email", occurredAt: new Date() });
      const otherApp = await tenantDb(ORG.id).application.create({ data: { name: "Other", clientId, assignedUserId: owner.userId, createdById: manager.userId } });
      const elsewhere = await createCorrespondence(owner, { applicationId: otherApp.id }, { ...input, occurredAt: new Date() });

      const linkable = await listLinkableCorrespondence(owner, [taskId]);
      expect(await listLinkableCorrespondence({ userId: manager.userId + "-nobody", role: "STAFF" }, [taskId])).toEqual([]); // can't see the case
      expect(linkable.map((l) => l.id)).toContain(onTask.id);
      expect(linkable.map((l) => l.id)).not.toContain(elsewhere.id);

      const eodActor = { ...owner, timeZone: "UTC" };
      const report = await startDay(eodActor);
      const line = report.items.find((i) => i.taskId === taskId)!;
      await expect(saveDraft(eodActor, report.id, { items: [{ id: line.id, correspondenceIds: [elsewhere.id] }] })).rejects.toThrow(/isn't on this task/);
      const saved = await saveDraft(eodActor, report.id, { items: [{ id: line.id, workDone: "Chased the state", correspondenceIds: [onTask.id] }] });
      expect(saved.items[0].correspondence.map((c) => c.correspondence.subject)).toEqual(["Follow-up email"]);
      // Leaving the ids out keeps the links; an empty list clears them.
      expect((await saveDraft(eodActor, report.id, { items: [{ id: line.id, workDone: "Chased the state" }] })).items[0].correspondence).toHaveLength(1);
      expect((await saveDraft(eodActor, report.id, { items: [{ id: line.id, correspondenceIds: [] }] })).items[0].correspondence).toHaveLength(0);
    });
  });
});
