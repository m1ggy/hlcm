import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";

// Staff can sign a client's person up for the evening text from Admin → Users
// (the person normally opts in on /account): only where the workspace sends
// it, only with their recorded consent, and never over a STOP reply.

const ORG = { id: "org_daily_signup", slug: "daily-signup", name: "Daily Signup Client" };
let adminId = "";
let personId = "";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-emails", () => ({ sendInviteEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
// Not importOriginal — the real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ user: { id: adminId, role: "OWNER" } })),
  requireSession: vi.fn(async () => ({ user: { id: adminId, role: "OWNER" } })),
  isAdmin: (role: string) => ["OWNER", "ADMIN", "ACCOUNTANT", "DEVELOPER"].includes(role),
  isSuperuser: (role: string) => role === "OWNER" || role === "DEVELOPER",
  ForbiddenError: class extends Error {},
  UnauthorizedError: class extends Error {},
}));

const { updateUser } = await import("@/lib/actions/users");

const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);
const base = () => ({
  userId: personId,
  name: "Pat Person",
  email: "pat@daily-signup.test",
  role: "STAFF" as const,
  active: true,
  smsRemindersEnabled: false,
});
const person = () => prisma.user.findUniqueOrThrow({ where: { id: personId } });

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: { ...ORG, kind: "TASKS", workDailyText: true, timezone: "UTC" } });
  forgetOrg(ORG.slug);
  const admin = await prisma.user.create({
    data: { organizationId: ORG.id, name: "Owner", email: "owner@daily-signup.test", passwordHash: "x", role: "OWNER" },
  });
  adminId = admin.id;
  const p = await prisma.user.create({
    data: { organizationId: ORG.id, name: "Pat Person", email: "pat@daily-signup.test", passwordHash: "x", role: "STAFF" },
  });
  personId = p.id;
});

beforeEach(async () => {
  await prisma.user.update({ where: { id: personId }, data: { phone: null, smsDailyUpdates: false, smsOptedOutAt: null } });
  await prisma.organization.update({ where: { id: ORG.id }, data: { workDailyText: true } });
  forgetOrg(ORG.slug);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the managing company signing a client's person up, from Client workspaces", () => {
  const HOME = { id: "org_daily_home", slug: "daily-home", name: "Daily Home" };
  let homeAdmin = "";
  let homeStaff = "";
  const actor = () => ({ userId: homeAdmin, orgId: HOME.id, role: "ADMIN", name: "Home Admin" });

  beforeAll(async () => {
    await prisma.organization.deleteMany({ where: { id: HOME.id } });
    await prisma.organization.create({ data: HOME });
    await prisma.organization.update({ where: { id: ORG.id }, data: { managedByOrgId: HOME.id } });
    forgetOrg(ORG.slug);
    homeAdmin = (await prisma.user.create({ data: { organizationId: HOME.id, name: "Home Admin", email: "admin@daily-home.test", passwordHash: "x", role: "ADMIN" } })).id;
    homeStaff = (await prisma.user.create({ data: { organizationId: HOME.id, name: "Home Staff", email: "staff@daily-home.test", passwordHash: "x", role: "STAFF" } })).id;
  });

  it("lists the client's people and signs one up with consent, audited in the client workspace", async () => {
    const { listClientPeople, saveClientTextSignup } = await import("@/lib/workspace-assignments");
    const { people, dailyTextOn } = await listClientPeople(actor(), ORG.id);
    expect(dailyTextOn).toBe(true);
    expect(people.map((p) => p.id)).toContain(personId);

    const input = { orgId: ORG.id, userId: personId, phone: "555-123-4567", enabled: true, consent: false };
    await expect(saveClientTextSignup(actor(), input)).rejects.toThrow("Confirm they agreed");
    await saveClientTextSignup(actor(), { ...input, consent: true });
    const after = await person();
    expect(after.smsDailyUpdates).toBe(true);
    expect(after.phone).toBe("+15551234567");
    expect(await prisma.auditLog.count({ where: { organizationId: ORG.id, entityId: personId, action: "sms_consent" } })).toBe(1);
  });

  it("saves a number alone, never overrides STOP, and refuses people outside the client and non-managers", async () => {
    const { saveClientTextSignup } = await import("@/lib/workspace-assignments");
    await saveClientTextSignup(actor(), { orgId: ORG.id, userId: personId, phone: "(555) 987-6543", enabled: false, consent: false });
    expect((await person()).phone).toBe("+15559876543");

    await prisma.user.update({ where: { id: personId }, data: { smsOptedOutAt: new Date() } });
    await expect(
      saveClientTextSignup(actor(), { orgId: ORG.id, userId: personId, phone: "5559876543", enabled: true, consent: true })
    ).rejects.toThrow("replied STOP");

    await expect(
      saveClientTextSignup(actor(), { orgId: ORG.id, userId: homeStaff, phone: "5559876543", enabled: false, consent: false })
    ).rejects.toThrow("isn't one of the client's people");
    const staffActor = { userId: homeStaff, orgId: HOME.id, role: "STAFF" };
    await expect(
      saveClientTextSignup(staffActor, { orgId: ORG.id, userId: personId, phone: "5559876543", enabled: false, consent: false })
    ).rejects.toThrow("Only admins");
  });

  it("lists the evening texts that went out, newest first, with who got each one", async () => {
    const { listEveningTexts } = await import("@/lib/workspace-assignments");
    await prisma.smsLog.deleteMany({ where: { organizationId: ORG.id } });
    await prisma.workSummaryNote.deleteMany({ where: { organizationId: ORG.id } });
    const sent = await prisma.workSummaryNote.create({
      data: { organizationId: ORG.id, period: "DAY", date: new Date("2026-11-10"), body: "Filed the renewal.", source: "AI", textedAt: new Date("2026-11-10T20:00:00Z"), textedCount: 1 },
    });
    await prisma.workSummaryNote.create({
      data: { organizationId: ORG.id, period: "DAY", date: new Date("2026-11-11"), body: "", source: "AI", textedAt: new Date("2026-11-11T20:00:00Z"), textedCount: 0 },
    });
    // A day that wasn't texted stays off the list.
    await prisma.workSummaryNote.create({ data: { organizationId: ORG.id, period: "DAY", date: new Date("2026-11-12"), body: "Quiet", source: "AI" } });
    await prisma.smsLog.createMany({
      data: [
        { organizationId: ORG.id, userId: personId, toNumber: "+15551234567", purpose: "WORK_DAY_TEXT", entityId: sent.id, ok: true },
        { organizationId: ORG.id, userId: null, toNumber: "+15550000000", purpose: "WORK_DAY_TEXT", entityId: sent.id, ok: false, error: "Invalid number" },
        { organizationId: ORG.id, userId: personId, toNumber: "+15551234567", purpose: "FORM_SUBMITTED", entityId: sent.id, ok: true },
      ],
    });

    const { timeZone, texts } = await listEveningTexts(actor(), ORG.id);
    expect(timeZone).toBe("UTC");
    expect(texts.map((t) => t.day)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(texts[0]).toMatchObject({ note: "", sentCount: 0, recipients: [] });
    expect(texts[1]).toMatchObject({
      note: "Filed the renewal.",
      sentCount: 1,
      recipients: [
        { name: "Pat Person", toNumber: "+15551234567", ok: true, error: null },
        { name: null, toNumber: "+15550000000", ok: false, error: "Invalid number" },
      ],
    });

    await expect(listEveningTexts({ userId: homeStaff, orgId: HOME.id, role: "STAFF" }, ORG.id)).rejects.toThrow("Only admins");
  });
});

describe("staff signing someone up for the evening text", () => {
  it("needs their consent, then saves the number in texting format and audits the consent", async () => {
    const without = await inOrg(() => updateUser({ ...base(), phone: "(555) 123-4567", smsDailyUpdates: true, smsConsent: false }));
    expect(without).toEqual({ ok: false, error: "Confirm they agreed to get the evening text" });
    expect((await person()).smsDailyUpdates).toBe(false);

    const ok = await inOrg(() => updateUser({ ...base(), phone: "(555) 123-4567", smsDailyUpdates: true, smsConsent: true }));
    expect(ok.ok).toBe(true);
    const after = await person();
    expect(after.smsDailyUpdates).toBe(true);
    expect(after.phone).toBe("+15551234567");
    const consent = await prisma.auditLog.findFirst({ where: { entityId: personId, action: "sms_consent", actorId: adminId } });
    expect(consent).not.toBeNull();
  });

  it("refuses a bad number and never overrides a STOP reply", async () => {
    const bad = await inOrg(() => updateUser({ ...base(), phone: "12", smsDailyUpdates: true, smsConsent: true }));
    expect(bad.ok).toBe(false);

    await prisma.user.update({ where: { id: personId }, data: { smsOptedOutAt: new Date() } });
    const stopped = await inOrg(() => updateUser({ ...base(), phone: "5551234567", smsDailyUpdates: true, smsConsent: true }));
    expect(stopped.ok).toBe(false);
    expect((await person()).smsDailyUpdates).toBe(false);
  });

  it("isn't available when the workspace doesn't send the evening text, and leaves it alone when not sent", async () => {
    await prisma.organization.update({ where: { id: ORG.id }, data: { workDailyText: false } });
    forgetOrg(ORG.slug);
    const off = await inOrg(() => updateUser({ ...base(), phone: "5551234567", smsDailyUpdates: true, smsConsent: true }));
    expect(off).toEqual({ ok: false, error: "This workspace doesn't send the evening text" });

    await prisma.user.update({ where: { id: personId }, data: { smsDailyUpdates: true } });
    const untouched = await inOrg(() => updateUser({ ...base(), phone: "5551234567" }));
    expect(untouched.ok).toBe(true);
    expect((await person()).smsDailyUpdates).toBe(true);
  });
});
