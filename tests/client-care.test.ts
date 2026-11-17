import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { parseLoginIdentifier, pickLoginUser, loginKeyOf } from "@/lib/login-identifier";
import { generatePassword } from "@/lib/generated-password";
import { formatPhone } from "@/lib/form-logic";
import { hasCare, homePathForRole, isWorkspacePathAllowed } from "@/lib/workspace-kind";
import { resolveSignInFields } from "@/lib/user-identity";
import { setWorkspaceSetup } from "@/lib/workspace-assignments";
import { getCareWeek } from "@/lib/care-summary";

// Clients and caregivers in a client company's tasks-only workspace
// (docs/client-care-plan.md): phone sign-in, generated passwords, the
// per-workspace switch and the weekly care line.

const CARE = { id: "org_cc_care", slug: "cc-care", name: "Care Agency" };

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: CARE.id } });
  await prisma.organization.create({ data: { ...CARE, kind: "TASKS", timezone: "America/Chicago" } });
  forgetOrg(CARE.slug);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("what goes in the sign-in box", () => {
  it("reads an email as an email", () => {
    expect(parseLoginIdentifier("  ana@x.test ")).toMatchObject({ kind: "email", key: "ana@x.test", where: { email: "ana@x.test" } });
  });

  it("reads a phone number however it's typed, only for accounts that can sign in", () => {
    for (const typed of ["(555) 123-4567", "555.123.4567", "+1 555 123 4567", "15551234567"]) {
      expect(parseLoginIdentifier(typed)).toMatchObject({
        kind: "phone",
        key: "+15551234567",
        where: { phone: "+15551234567", active: true, isSupport: false, assignedFromUserId: null },
      });
    }
  });

  it("rejects what's neither", () => {
    expect(parseLoginIdentifier("")).toBeNull();
    expect(parseLoginIdentifier("maria")).toBeNull();
    expect(parseLoginIdentifier("12345")).toBeNull();
  });

  it("signs in only when exactly one account matches", () => {
    expect(pickLoginUser([])).toBeNull();
    expect(pickLoginUser([{ id: "a" }])).toEqual({ id: "a" });
    expect(pickLoginUser([{ id: "a" }, { id: "b" }])).toBeNull();
  });

  it("throttles an account by its email, else its phone", () => {
    expect(loginKeyOf({ id: "u1", email: "a@x.test", phone: "+15551234567" })).toBe("a@x.test");
    expect(loginKeyOf({ id: "u1", email: null, phone: "+15551234567" })).toBe("+15551234567");
  });
});

describe("generated passwords", () => {
  it("are three words and a number, long enough to sign in with", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[1-9][0-9]$/);
      expect(p.length).toBeGreaterThanOrEqual(8);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe("which pages a workspace opens", () => {
  const full = { kind: "FULL" as const, careEnabled: false };
  const tasks = { kind: "TASKS" as const, careEnabled: false };
  const care = { kind: "TASKS" as const, careEnabled: true };

  it("full workspaces always have care; tasks-only ones only when switched on", () => {
    expect(hasCare(full)).toBe(true);
    expect(hasCare(tasks)).toBe(false);
    expect(hasCare(care)).toBe(true);
  });

  it("opens the care pages in a tasks-only workspace only with care on", () => {
    for (const p of ["/care-recipients", "/caregivers", "/today", "/hours", "/search"]) {
      expect(isWorkspacePathAllowed(tasks, p), p).toBe(false);
      expect(isWorkspacePathAllowed(care, p), p).toBe(true);
    }
    // Licensing stays out either way.
    for (const p of ["/clients", "/applications", "/invoices", "/payroll", "/time"]) expect(isWorkspacePathAllowed(care, p), p).toBe(false);
    expect(isWorkspacePathAllowed(full, "/clients")).toBe(true);
  });

  it("sends caregivers to Today instead of projects", () => {
    expect(isWorkspacePathAllowed(care, "/work/summary", "CAREGIVER")).toBe(false);
    expect(isWorkspacePathAllowed(care, "/work/summary", "STAFF")).toBe(true);
    expect(homePathForRole(care, "CAREGIVER")).toBe("/today");
    expect(homePathForRole(care, "OWNER")).toBe("/work/summary");
    expect(homePathForRole(full, "CAREGIVER")).toBe("/");
  });
});

describe("sign-in fields for a person", () => {
  it("lets only caregivers go without an email, and then needs a real phone", async () => {
    await runAsTenant(CARE, async () => {
      await expect(resolveSignInFields({ role: "STAFF", email: "", phone: "5551112222" })).rejects.toThrow(/only caregivers/);
      await expect(resolveSignInFields({ role: "CAREGIVER", email: "", phone: "" })).rejects.toThrow(/email or a phone/);
      await expect(resolveSignInFields({ role: "CAREGIVER", phone: "12" })).rejects.toThrow(/valid phone/);
      expect(await resolveSignInFields({ role: "CAREGIVER", phone: "(555) 111-2222" })).toEqual({ email: null, phone: "+15551112222" });
      expect(await resolveSignInFields({ role: "STAFF", email: "s@x.test", phone: "call the office" })).toEqual({ email: "s@x.test", phone: "call the office" });
    });
  });

  it("keeps a phone that someone signs in with to that one person", async () => {
    await runAsTenant(CARE, async () => {
      const t = tenantDb(CARE.id);
      const maria = await t.user.create({ data: { name: "Maria", phone: "+15552223333", passwordHash: "x", role: "CAREGIVER" } });
      // Another phone-only caregiver on the same number: no.
      await expect(resolveSignInFields({ role: "CAREGIVER", phone: "555-222-3333" })).rejects.toThrow(/already has that phone/);
      // Someone with an email can't take it either — it would block Maria's sign-in.
      await expect(resolveSignInFields({ role: "STAFF", email: "o@x.test", phone: "5552223333" })).rejects.toThrow(/how someone else signs in/);
      // Maria saving her own record is fine.
      expect(await resolveSignInFields({ userId: maria.id, role: "CAREGIVER", phone: "5552223333" })).toEqual({ email: null, phone: "+15552223333" });
      // Once she's deactivated, the number is free.
      await t.user.update({ where: { id: maria.id }, data: { active: false } });
      expect(await resolveSignInFields({ role: "CAREGIVER", phone: "5552223333" })).toEqual({ email: null, phone: "+15552223333" });
    });
  });
});

describe("the platform switch", () => {
  it("turns care on for a tasks-only workspace, never stores it on a full one", async () => {
    await setWorkspaceSetup(CARE.id, { kind: "TASKS", managedByOrgId: null, careEnabled: true });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: CARE.id } })).careEnabled).toBe(true);
    await setWorkspaceSetup(CARE.id, { kind: "FULL", managedByOrgId: null, careEnabled: true });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: CARE.id } })).careEnabled).toBe(false);
    // Leaving it out keeps what's there.
    await setWorkspaceSetup(CARE.id, { kind: "TASKS", managedByOrgId: null, careEnabled: true });
    await setWorkspaceSetup(CARE.id, { kind: "TASKS", managedByOrgId: null });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: CARE.id } })).careEnabled).toBe(true);
  });
});

describe("the weekly care line", () => {
  it("counts visits, missed slots and concerns in the workspace's week", async () => {
    await runAsTenant(CARE, async () => {
      const t = tenantDb(CARE.id);
      const owner = await t.user.create({ data: { name: "Olive Owner", email: "olive@care.test", passwordHash: "x", role: "OWNER" } });
      const cg = await t.user.create({ data: { name: "Gabe", phone: "+15553334444", passwordHash: "x", role: "CAREGIVER" } });
      const lee = await t.careRecipient.create({ data: { name: "Mrs. Lee", createdById: owner.id } });
      // Monday 2026-11-09 to Sunday 11-15. Slots Mon and Wed 9–11 (created before the week).
      for (const weekday of [1, 3]) {
        await t.visitShift.create({
          data: { careRecipientId: lee.id, caregiverId: cg.id, weekday, startMinute: 540, endMinute: 660, createdById: owner.id, createdAt: new Date("2026-11-01T12:00:00Z") },
        });
      }
      // Monday's visit happened (9:05–11:00 Chicago = 15:05–17:00 UTC); Wednesday's didn't.
      await t.timeEntry.create({
        data: { userId: cg.id, careRecipientId: lee.id, clockIn: new Date("2026-11-09T15:05:00Z"), clockOut: new Date("2026-11-09T17:00:00Z") },
      });
      await t.careIncident.create({ data: { careRecipientId: lee.id, category: "HEALTH_CHANGE", urgent: false, description: "Tired", reportedById: cg.id, createdAt: new Date("2026-11-10T16:00:00Z") } });

      const week = await getCareWeek({ monday: "2026-11-09", timeZone: "America/Chicago", now: new Date("2026-11-17T12:00:00Z") });
      expect(week.visits).toBe(1);
      expect(week.visitHours).toBeCloseTo(1.9, 1);
      expect(week.missed).toBe(1);
      expect(week.days.find((d) => d.date === "2026-11-11")?.missed).toBe(1);
      expect(week.concernsRaised).toBe(1);
      expect(week.openConcerns).toBe(1);
    });
  });
});

describe("a new workspace's owner with a made-up password", () => {
  it("can sign in with it straight away, and no invite is sent", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const { createOrganization, inviteOwner } = await import("@/lib/platform");
    await prisma.organization.deleteMany({ where: { slug: "cc-given" } });
    const { org, inviteSent, ownerPassword } = await createOrganization({
      name: "Given Co",
      slug: "cc-given",
      ownerName: "Gail",
      ownerEmail: "gail@given.test",
      kind: "TASKS",
      careEnabled: true,
      ownerPassword: "generate",
    });
    expect(inviteSent).toBe(false);
    expect(ownerPassword).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d\d$/);
    const t = tenantDb(org.id);
    const owner = await t.user.findFirstOrThrow({ where: { role: "OWNER" } });
    expect(await bcrypt.compare(ownerPassword!, owner.passwordHash)).toBe(true);
    // No invite link was issued: the console shows "Password given to them".
    expect(await t.authToken.count({ where: { userId: owner.id, kind: "INVITE" } })).toBe(0);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).careEnabled).toBe(true);

    // A second owner added the same way.
    const second = await inviteOwner(org.id, { name: "Hal", email: "hal@given.test", password: "generate" });
    expect(second.inviteSent).toBe(false);
    const hal = await t.user.findUniqueOrThrow({ where: { id: second.userId } });
    expect(await bcrypt.compare(second.ownerPassword!, hal.passwordHash)).toBe(true);
  });

  it("still invites by email when asked to", async () => {
    const { createOrganization } = await import("@/lib/platform");
    await prisma.organization.deleteMany({ where: { slug: "cc-invited" } });
    const { ownerPassword } = await createOrganization({ name: "Invited Co", slug: "cc-invited", ownerName: "Ivy", ownerEmail: "ivy@invited.test" });
    expect(ownerPassword).toBeUndefined();
  });
});

describe("phone display", () => {
  it("shows a US number the readable way and anything else as stored", () => {
    expect(formatPhone("+15551112222")).toBe("(555) 111-2222");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
    expect(formatPhone("call the office")).toBe("call the office");
    expect(formatPhone(null)).toBe("");
  });
});
