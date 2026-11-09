import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import {
  canShareApplication,
  createShareLink,
  hashShareToken,
  openShareLink,
  revokeShareLink,
  setShareLinkExpiry,
  sharePageData,
  type ShareActor,
} from "@/lib/share-links";

// Share links (docs/client-portal-eod-plan.md, Phase D).

const A = { id: "org_share_a", slug: "share-a", name: "Share A" };
const B = { id: "org_share_b", slug: "share-b", name: "Share B" };
const inA = <T,>(fn: () => Promise<T>) => runAsTenant(A, fn);
const inB = <T,>(fn: () => Promise<T>) => runAsTenant(B, fn);
const DAY = "2026-11-04"; // a Wednesday
const NOW = new Date("2026-11-04T18:00:00Z");

let owner: ShareActor; // the application's VA
let manager: ShareActor;
let other: ShareActor; // STAFF, not on it
let appId = "";

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await prisma.organization.create({ data: { ...A, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...B, timezone: "UTC" } });
  forgetOrg(A.slug);
  forgetOrg(B.slug);
  const t = tenantDb(A.id);
  const mk = (name: string, role: "STAFF" | "MANAGER") =>
    t.user.create({ data: { name, email: `${name.toLowerCase().replace(" ", ".")}@share.test`, passwordHash: "x", role } });
  const [o, m, x] = await Promise.all([mk("Val VA", "STAFF"), mk("Mo Manager", "MANAGER"), mk("Oz Other", "STAFF")]);
  owner = { userId: o.id, role: "STAFF" };
  manager = { userId: m.id, role: "MANAGER" };
  other = { userId: x.id, role: "STAFF" };
  await tenantDb(B.id).user.create({ data: { name: "Bea", email: "bea@share-b.test", passwordHash: "x", role: "OWNER" } });

  const client = await t.client.create({ data: { name: "Sunrise Care", createdById: m.id } });
  appId = (await t.application.create({ data: { name: "Sunrise license", clientId: client.id, assignedUserId: o.id, createdById: m.id } })).id;
  const phase = await t.phase.create({ data: { applicationId: appId, name: "Paperwork", sortOrder: 0 } });
  const task = await t.task.create({
    data: { label: "Collect the W-9", applicationId: appId, phaseId: phase.id, status: "COMPLETED", blockedReason: "SECRET-BLOCKED", createdById: m.id },
  });
  await t.task.create({ data: { label: "Sign the lease", applicationId: appId, createdById: m.id, description: "SECRET-DESCRIPTION" } });

  // Shared and unshared work and correspondence on the Wednesday.
  const report = await t.eodReport.create({ data: { userId: o.id, reportDate: new Date(`${DAY}T00:00:00Z`), status: "SUBMITTED", submittedAt: NOW } });
  await t.eodReportItem.createMany({
    data: [
      { reportId: report.id, taskId: task.id, title: "Collect the W-9", applicationId: appId, clientId: client.id, workDone: "Got the signed W-9", clientVisible: true, internalNote: "SECRET-NOTE", minutes: 42 },
      { reportId: report.id, title: "Internal chat", applicationId: appId, workDone: "SECRET-UNSHARED-LINE", clientVisible: false },
    ],
  });
  await t.correspondence.createMany({
    data: [
      { applicationId: appId, clientId: client.id, kind: "EMAIL", direction: "OUTBOUND", subject: "Sent the packet", occurredAt: new Date(`${DAY}T15:00:00Z`), body: "SECRET-BODY", clientVisible: true, createdById: o.id },
      { applicationId: appId, clientId: client.id, kind: "PHONE_CALL", direction: "OUTBOUND", subject: "SECRET-UNSHARED-CALL", occurredAt: new Date(`${DAY}T16:00:00Z`), createdById: o.id },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("making and turning off links", () => {
  it("is for management and the application's own people", async () => {
    await inA(async () => {
      expect(await canShareApplication(owner, appId)).toBe(true);
      expect(await canShareApplication(manager, appId)).toBe(true);
      expect(await canShareApplication(other, appId)).toBe(false);
      await expect(createShareLink(other, appId)).rejects.toThrow(/Only managers/);
      await expect(createShareLink({ ...owner, role: "CLIENT" }, appId)).rejects.toThrow(/Only managers/);
    });
  });

  it("stores only a hash, and a new link turns the old one off", async () => {
    await inA(async () => {
      const first = await createShareLink(owner, appId, {}, NOW);
      expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await tenantDb(A.id).applicationShareLink.findUniqueOrThrow({ where: { id: first.link.id } });
      expect(row.tokenHash).toBe(hashShareToken(first.token));
      expect(JSON.stringify(row)).not.toContain(first.token);

      const second = await createShareLink(manager, appId, {}, NOW);
      expect(await openShareLink(first.token, null, NOW)).toBeNull();
      expect((await openShareLink(second.token, null, NOW))?.id).toBe(second.link.id);
      expect(await tenantDb(A.id).applicationShareLink.count({ where: { applicationId: appId, revokedAt: null } })).toBe(1);
      const audit = await tenantDb(A.id).auditLog.findMany({ where: { entityId: appId, field: "share_link" }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["create_share_link", "regenerate_share_link", "share_link_viewed"]));

      await revokeShareLink(owner, appId, NOW);
      expect(await openShareLink(second.token, null, NOW)).toBeNull();
      await expect(revokeShareLink(owner, appId, NOW)).rejects.toThrow(/no active link/);
    });
  });

  it("stops working after its expiry", async () => {
    await inA(async () => {
      await expect(createShareLink(owner, appId, { expiresAt: new Date("2026-11-01T00:00:00Z") }, NOW)).rejects.toThrow(/future/);
      const { token } = await createShareLink(owner, appId, { expiresAt: new Date("2026-11-10T00:00:00Z") }, NOW);
      expect(await openShareLink(token, null, NOW)).not.toBeNull();
      expect(await openShareLink(token, null, new Date("2026-11-10T00:00:01Z"))).toBeNull();
      await setShareLinkExpiry(owner, appId, null, NOW);
      expect(await openShareLink(token, null, new Date("2027-01-01T00:00:00Z"))).not.toBeNull();
    });
  });
});

describe("opening a link", () => {
  it("counts views, audits at most hourly, and ignores junk", async () => {
    await inA(async () => {
      const { token, link } = await createShareLink(owner, appId, {}, NOW);
      const views = () => tenantDb(A.id).auditLog.count({ where: { entityId: appId, action: "share_link_viewed" } });
      const before = await views();
      await openShareLink(token, "203.0.113.9", NOW);
      await openShareLink(token, "203.0.113.9", new Date(NOW.getTime() + 60_000));
      await openShareLink(token, "203.0.113.9", new Date(NOW.getTime() + 2 * 3_600_000));
      expect((await tenantDb(A.id).applicationShareLink.findUniqueOrThrow({ where: { id: link.id } })).viewCount).toBe(3);
      expect((await views()) - before).toBe(2);
      expect(await openShareLink("short", null, NOW)).toBeNull();
      expect(await openShareLink(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), null, NOW)).toBeNull();
    });
  });

  it("never opens another workspace's application", async () => {
    const { token } = await inA(() => createShareLink(owner, appId, {}, NOW));
    expect(await inB(() => openShareLink(token, null, NOW))).toBeNull();
    expect(await inA(() => openShareLink(token, null, NOW))).not.toBeNull();
  });
});

describe("what the page shows", () => {
  it("only shared work and correspondence, and nothing internal", async () => {
    const data = await inA(() => sharePageData(appId, { day: DAY, timeZone: "UTC" }));
    const wednesday = data.week.days.find((d) => d.date === DAY)!;
    expect(wednesday.entries).toEqual([
      { type: "work", title: "Collect the W-9", text: "Got the signed W-9", status: null },
      expect.objectContaining({ type: "correspondence", subject: "Sent the packet", direction: "OUTBOUND" }),
    ]);
    expect(data.phases.map((p) => [p.name, p.tasks.map((t) => t.title)])).toEqual([
      ["Paperwork", ["Collect the W-9"]],
      ["Other", ["Sign the lease"]],
    ]);
    expect(data.progress).toEqual({ done: 1, total: 2 });
    expect(data.clientName).toBe("Sunrise Care");
    // Internal fields never reach the payload.
    const json = JSON.stringify(data);
    for (const secret of ["SECRET", "42", "Val VA", "Mo Manager"]) expect(json).not.toContain(secret);
  });
});
