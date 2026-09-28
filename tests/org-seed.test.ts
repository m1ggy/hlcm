import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { seedOrganization } from "@/lib/org-seed";
import { ALL_STAGES } from "@/lib/pipeline-stage-catalog";
import { getPicklists } from "@/lib/picklists";

// seedOrganization gives a new tenant a copy of the template org's setup
// (CTK in production), or a generic set when there's no template (3e).

const template = { id: "org_seed_tpl", slug: "seed-tpl", name: "Template Co" };
const acme = { id: "org_seed_acme", slug: "acme", name: "Acme Licensing" };
const bare = { id: "org_seed_bare", slug: "bare", name: "Bare Org" };

async function createOrgWithOwner(org: { id: string; slug: string; name: string }) {
  await prisma.organization.upsert({ where: { id: org.id }, create: org, update: {} });
  return (await tenantDb(org.id).user.create({ data: { name: "Owner", email: `owner@${org.slug}.test`, passwordHash: "x", role: "OWNER" } })).id;
}

let acmeOwner: string;
let bareOwner: string;

beforeAll(async () => {
  // A template org with its own setup, including a retired license type and
  // a checklist item that points at it.
  const tplOwner = await createOrgWithOwner(template);
  const t = tenantDb(template.id);
  const cila = await t.licenseTypeTemplate.create({ data: { name: "CILA", description: "Group homes", createdById: tplOwner } });
  const retired = await t.licenseTypeTemplate.create({ data: { name: "Old License", active: false, createdById: tplOwner } });
  const renewal = await t.caseType.create({ data: { name: "Renewal", createdById: tplOwner } });
  const change = await t.caseType.create({ data: { name: "Change of Ownership", createdById: tplOwner } });
  await t.checklistItemTemplate.createMany({
    data: [
      { licenseTypeTemplateId: cila.id, caseTypeId: renewal.id, label: "Collect floor plan", phaseName: "Intake", sortOrder: 0, createdById: tplOwner },
      { licenseTypeTemplateId: null, caseTypeId: change.id, label: "New owner background check", sortOrder: 0, createdById: tplOwner },
      { licenseTypeTemplateId: retired.id, caseTypeId: renewal.id, label: "Retired license step", sortOrder: 1, createdById: tplOwner },
    ],
  });
  await t.serviceType.create({ data: { name: "Home Care", hex: "#E65100", textColor: "#FFFFFF", createdById: tplOwner } });
  await t.picklistOption.createMany({
    data: [
      { list: "AGENCY", code: "IDPH", label: "IDPH", sortOrder: 0 },
      { list: "PAYER", code: "AETNA", label: "Aetna", sortOrder: 0 },
      { list: "PAYER", code: "GONE", label: "Gone", sortOrder: 1, active: false },
      { list: "BALL_WITH", code: "TPL", label: "Template Co", sortOrder: 0 },
      { list: "BALL_WITH", code: "CLIENT", label: "Client", sortOrder: 1 },
    ],
  });

  acmeOwner = await createOrgWithOwner(acme);
  await seedOrganization({ org: acme, ownerId: acmeOwner, templateOrgSlug: template.slug });

  bareOwner = await createOrgWithOwner(bare);
  await seedOrganization({ org: bare, ownerId: bareOwner, templateOrgSlug: null });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedOrganization from a template org", () => {
  const a = () => tenantDb(acme.id);

  it("copies active license types, case types and service types", async () => {
    expect((await a().licenseTypeTemplate.findMany()).map((l) => [l.name, l.description])).toEqual([["CILA", "Group homes"]]);
    expect((await a().caseType.findMany({ orderBy: { name: "asc" } })).map((c) => c.name)).toEqual(["Change of Ownership", "Renewal"]);
    expect((await a().serviceType.findMany()).map((s) => [s.name, s.hex])).toEqual([["Home Care", "#E65100"]]);
  });

  it("copies checklist templates, re-pointed at the new org's own license/case types", async () => {
    const items = await a().checklistItemTemplate.findMany({ include: { licenseTypeTemplate: true, caseType: true }, orderBy: { label: "asc" } });
    expect(items.map((i) => [i.label, i.licenseTypeTemplate?.name ?? null, i.caseType.name, i.phaseName])).toEqual([
      ["Collect floor plan", "CILA", "Renewal", "Intake"],
      ["New owner background check", null, "Change of Ownership", null],
    ]);
    expect(items.every((i) => i.organizationId === acme.id && i.caseType.organizationId === acme.id)).toBe(true);
  });

  it("copies active picklists, with the template's own ball-with option becoming the new org", async () => {
    const lists = await runAsTenant(acme, () => getPicklists());
    expect(lists.AGENCY.map((o) => o.label)).toEqual(["IDPH"]);
    expect(lists.PAYER.map((o) => o.code)).toEqual(["AETNA"]);
    expect(lists.BALL_WITH.map((o) => [o.code, o.label])).toEqual([["US", "Acme Licensing"], ["CLIENT", "Client"]]);
  });

  it("always seeds the stage catalog and an org-named invoice profile", async () => {
    expect(await a().pipelineStage.count()).toBe(ALL_STAGES.length);
    const names = (await a().pipelineStage.findMany({ select: { name: true } })).map((s) => s.name);
    expect(names).toContain("Acme Licensing Internal Mock Scheduled");
    expect((await a().invoiceProfile.findMany()).map((p) => [p.name, p.isDefault])).toEqual([["Acme Licensing", true]]);
  });

  it("is idempotent", async () => {
    await seedOrganization({ org: acme, ownerId: acmeOwner, templateOrgSlug: template.slug });
    expect(await a().licenseTypeTemplate.count()).toBe(1);
    expect(await a().caseType.count()).toBe(2);
    expect(await a().checklistItemTemplate.count()).toBe(2);
    expect(await a().serviceType.count()).toBe(1);
    expect(await a().picklistOption.count()).toBe(4);
    expect(await a().pipelineStage.count()).toBe(ALL_STAGES.length);
  });

  it("leaves the template org untouched", async () => {
    const t = tenantDb(template.id);
    expect(await t.licenseTypeTemplate.count()).toBe(2);
    expect(await t.checklistItemTemplate.count()).toBe(3);
    expect(await t.pipelineStage.count()).toBe(0);
  });
});

describe("seedOrganization without a template", () => {
  it("falls back to the generic set", async () => {
    const b = tenantDb(bare.id);
    expect((await b.caseType.findMany({ orderBy: { name: "asc" } })).map((c) => c.name)).toEqual([
      "Change of Ownership",
      "New",
      "Post-License/Ongoing",
      "Renewal",
    ]);
    expect(await b.licenseTypeTemplate.count()).toBe(0);
    expect(await b.checklistItemTemplate.count()).toBe(0);
    const lists = await runAsTenant(bare, () => getPicklists());
    expect(lists.BALL_WITH.map((o) => o.label)).toEqual(["Bare Org", "Client", "Government"]);
    expect(lists.AGENCY.map((o) => o.code)).toEqual(["OTHER"]);
  });
});
