import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Shift forms (docs/shift-forms-plan.md): forms a caregiver fills in when
// they end a visit, required before they can clock out. Which forms apply,
// the clock-out rule, submitting one, and the builder's save rules.

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => undefined),
  getEmailBranding: async () => ({ appUrl: "https://shift.example.test", brand: "Shift Co" }),
  renderEmailLayout: (o: { bodyHtml: string }) => o.bodyHtml,
}));

const sessionUser = vi.hoisted(() => ({ current: null as null | { id: string; role: string } }));
// Not importOriginal — the real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => {
  class ForbiddenError extends Error {}
  class UnauthorizedError extends Error {}
  const session = async () => {
    if (!sessionUser.current) throw new UnauthorizedError("Unauthorized");
    return { user: { ...sessionUser.current, name: "Tester" } };
  };
  return {
    ROLES: ["DEVELOPER", "OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"],
    requireSession: session,
    requireRole: session,
    isSuperuser: (role: string) => role === "OWNER" || role === "DEVELOPER",
    isAdmin: (role: string) => ["OWNER", "DEVELOPER", "ADMIN", "ACCOUNTANT"].includes(role),
    isManagement: (role: string) => ["OWNER", "DEVELOPER", "ADMIN", "ACCOUNTANT", "MANAGER"].includes(role),
    isTrackedRole: (role: string) => !!role && role !== "CAREGIVER" && role !== "CLIENT",
    ForbiddenError,
    UnauthorizedError,
  };
});

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { alertForSubmission, recordSubmission } from "@/lib/form-submit";
import { missingShiftForms, shiftFormsFor } from "@/lib/shift-forms";
import { clockOutFor } from "@/lib/time-clock";
import { saveFormTemplate } from "@/lib/actions/form-templates";

const ORG = { id: "org_shift_forms", slug: "shift-co", name: "Shift Co" };
const PLAIN = { id: "org_shift_plain", slug: "shift-plain", name: "Plain Co" };
const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);

let manager = "";
let gabe = "";
let lee = "";
let kim = "";
let everyone = ""; // shift form for every client's visits
let leeOnly = ""; // shift form for Mrs. Lee only

const fields = { create: [{ key: "meds", label: "Meds given?", type: "RADIO" as const, options: ["Yes", "No"], required: true, sortOrder: 0 }] };

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [ORG.id, PLAIN.id] } } });
  // A client workspace with clients and caregivers turned on; and one without.
  await prisma.organization.create({ data: { ...ORG, kind: "TASKS", careEnabled: true } });
  await prisma.organization.create({ data: { ...PLAIN, kind: "TASKS", careEnabled: false } });
  forgetOrg(ORG.slug);
  forgetOrg(PLAIN.slug);
  const t = tenantDb(ORG.id);
  manager = (await t.user.create({ data: { name: "Mia Manager", email: "mia@shift.test", passwordHash: "x", role: "MANAGER" } })).id;
  gabe = (await t.user.create({ data: { name: "Gabe Ortiz", phone: "+15553334444", passwordHash: "x", role: "CAREGIVER" } })).id;
  lee = (await t.careRecipient.create({ data: { name: "Mrs. Lee", createdById: manager } })).id;
  kim = (await t.careRecipient.create({ data: { name: "Mr. Kim", createdById: manager } })).id;
  everyone = (await t.formTemplate.create({ data: { name: "Shift report", slug: "shift-report", createdById: manager, shiftForm: true, notifyUserIds: [manager], fields } })).id;
  leeOnly = (
    await t.formTemplate.create({
      data: { name: "Lee wound check", slug: "lee-wound", createdById: manager, shiftForm: true, shiftAllClients: false, shiftClients: { create: [{ careRecipientId: lee }] }, notifyUserIds: [manager], fields },
    })
  ).id;
  // An ordinary public form never applies to visits.
  await t.formTemplate.create({ data: { name: "Intake", slug: "intake", createdById: manager, fields } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const openVisit = (careRecipientId: string) =>
  inOrg(() => tenantDb(ORG.id).timeEntry.create({ data: { userId: gabe, careRecipientId, clockIn: new Date(Date.now() - 60 * 60_000) } }));

describe("which shift forms apply", () => {
  it("every-client forms apply to all visits; chosen-client forms only to theirs", async () => {
    await inOrg(async () => {
      expect((await shiftFormsFor(lee)).map((f) => f.name)).toEqual(["Lee wound check", "Shift report"]);
      expect((await shiftFormsFor(kim)).map((f) => f.name)).toEqual(["Shift report"]);
    });
  });

  it("turned-off forms don't apply", async () => {
    await inOrg(async () => {
      await tenantDb(ORG.id).formTemplate.update({ where: { id: leeOnly }, data: { active: false } });
      expect((await shiftFormsFor(lee)).map((f) => f.name)).toEqual(["Shift report"]);
      await tenantDb(ORG.id).formTemplate.update({ where: { id: leeOnly }, data: { active: true } });
    });
  });
});

describe("ending a visit", () => {
  it("is blocked until every applicable form is filled in for that visit", async () => {
    const visit = await openVisit(lee);
    await inOrg(async () => {
      const ref = { visitId: visit.id, careRecipientId: lee };
      await expect(clockOutFor(gabe)).rejects.toThrow(/Fill in these forms before ending the visit: "Lee wound check", "Shift report"/);

      const shift = { submittedById: gabe, careRecipientId: lee, visitId: visit.id };
      await recordSubmission({ templateId: everyone, answers: { meds: "Yes" }, files: [], ip: null, shift });
      expect((await missingShiftForms(gabe, ref)).map((f) => f.name)).toEqual(["Lee wound check"]);
      await expect(clockOutFor(gabe)).rejects.toThrow(/Fill in "Lee wound check" before ending the visit/);

      await recordSubmission({ templateId: leeOnly, answers: { meds: "No" }, files: [], ip: null, shift });
      expect(await missingShiftForms(gabe, ref)).toEqual([]);
      const ended = await clockOutFor(gabe);
      expect(ended.clockOut).not.toBeNull();
    });
  });

  it("a form filled for an earlier visit doesn't count for the next one", async () => {
    const visit = await openVisit(kim);
    await inOrg(async () => {
      expect((await missingShiftForms(gabe, { visitId: visit.id, careRecipientId: kim })).map((f) => f.name)).toEqual(["Shift report"]);
      await expect(clockOutFor(gabe)).rejects.toThrow(/Shift report/);
      await recordSubmission({ templateId: everyone, answers: { meds: "Yes" }, files: [], ip: null, shift: { submittedById: gabe, careRecipientId: kim, visitId: visit.id } });
      await clockOutFor(gabe);
    });
  });

  it("a clock-in without a client isn't a visit and needs no forms", async () => {
    await inOrg(async () => {
      await tenantDb(ORG.id).timeEntry.create({ data: { userId: gabe, clockIn: new Date(Date.now() - 10 * 60_000) } });
      await clockOutFor(gabe);
    });
  });
});

describe("submitting", () => {
  it("records who, for whom and which visit, and tells the office about the visit", async () => {
    await inOrg(async () => {
      const row = await tenantDb(ORG.id).formSubmission.findFirstOrThrow({ where: { templateId: leeOnly }, include: { submittedBy: true, careRecipient: true } });
      expect(row.submittedBy?.name).toBe("Gabe Ortiz");
      expect(row.careRecipient?.name).toBe("Mrs. Lee");
      expect(row.visitId).not.toBeNull();
      await alertForSubmission(row.id);
      const bell = await tenantDb(ORG.id).notification.findFirstOrThrow({ where: { userId: manager, entityId: row.id } });
      expect(bell.message).toBe('New "Lee wound check" submission from Gabe (visit with Mrs. Lee)');
    });
  });

  it("a shift form can't come in through the public link, and a public form can't be sent as a shift form", async () => {
    await inOrg(async () => {
      await expect(recordSubmission({ templateId: everyone, answers: { meds: "Yes" }, files: [], ip: "1.2.3.4" })).rejects.toThrow(/isn't available/);
      const intake = await tenantDb(ORG.id).formTemplate.findFirstOrThrow({ where: { slug: "intake" } });
      const visit = await tenantDb(ORG.id).timeEntry.findFirstOrThrow({ where: { userId: gabe } });
      await expect(
        recordSubmission({ templateId: intake.id, answers: { meds: "Yes" }, files: [], ip: null, shift: { submittedById: gabe, careRecipientId: lee, visitId: visit.id } })
      ).rejects.toThrow(/isn't available/);
    });
  });
});

describe("the form builder", () => {
  const input = (extra: object) => ({
    name: "Mileage",
    slug: "mileage",
    fields: [{ key: "miles", label: "Miles driven", type: "NUMBER" as const }],
    ...extra,
  });

  it("saves a shift form for chosen clients, and replaces the list on edit", async () => {
    sessionUser.current = { id: manager, role: "MANAGER" };
    await inOrg(async () => {
      const r = await saveFormTemplate(null, input({ shiftForm: true, shiftAllClients: false, shiftClientIds: [lee, kim], sendCopyToSubmitter: true }));
      if (!r.ok) throw new Error(r.error);
      const saved = await tenantDb(ORG.id).formTemplate.findUniqueOrThrow({ where: { id: r.data.id }, include: { shiftClients: true } });
      expect(saved.shiftForm).toBe(true);
      // No email copy for a shift form (it has no Email question anyway).
      expect(saved.sendCopyToSubmitter).toBe(false);
      expect(saved.shiftClients.map((c) => c.careRecipientId).sort()).toEqual([lee, kim].sort());

      const again = await saveFormTemplate(r.data.id, input({ shiftForm: true, shiftAllClients: false, shiftClientIds: [kim] }));
      expect(again.ok).toBe(true);
      expect((await tenantDb(ORG.id).formShiftClient.findMany({ where: { templateId: r.data.id } })).map((c) => c.careRecipientId)).toEqual([kim]);
    });
  });

  it("needs at least one client when it's not every client", async () => {
    sessionUser.current = { id: manager, role: "MANAGER" };
    await inOrg(async () => {
      const r = await saveFormTemplate(null, input({ slug: "mileage-2", shiftForm: true, shiftAllClients: false, shiftClientIds: [] }));
      expect(r).toEqual({ ok: false, error: "Pick at least one client for this shift form, or choose every client" });
    });
  });

  it("needs a workspace with clients and caregivers", async () => {
    const t = tenantDb(PLAIN.id);
    const owner = await t.user.create({ data: { name: "Pat", email: "pat@plain.test", passwordHash: "x", role: "MANAGER" } });
    sessionUser.current = { id: owner.id, role: "MANAGER" };
    await runAsTenant(PLAIN, async () => {
      const r = await saveFormTemplate(null, input({ shiftForm: true }));
      expect(r).toEqual({ ok: false, error: "Shift forms need clients and caregivers turned on for this workspace" });
    });
  });
});
