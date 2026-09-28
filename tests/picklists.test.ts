import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { codeFromLabel, getPicklists, isPicklistCode, pickerChoices } from "@/lib/picklists";

// Agency / payer / ball-with choices are per organization (3d).

const A = { id: "org_pick_a", slug: "pick-a" };
const B = { id: "org_pick_b", slug: "pick-b" };

beforeAll(async () => {
  for (const org of [A, B]) {
    await prisma.organization.upsert({ where: { id: org.id }, create: { ...org, name: org.slug }, update: {} });
  }
  await tenantDb(A.id).picklistOption.createMany({
    data: [
      { list: "PAYER", code: "ACME_HEALTH", label: "Acme Health", sortOrder: 1 },
      { list: "PAYER", code: "OLD_PLAN", label: "Old Plan", sortOrder: 0, active: false },
      { list: "AGENCY", code: "DOH", label: "Dept. of Health" },
    ],
  });
  await tenantDb(B.id).picklistOption.create({ data: { list: "PAYER", code: "BETA_CARE", label: "Beta Care" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("picklists", () => {
  it("each org sees only its own options, in order, retired included", async () => {
    const lists = await runAsTenant(A, () => getPicklists());
    expect(lists.PAYER.map((o) => o.code)).toEqual(["OLD_PLAN", "ACME_HEALTH"]);
    expect(lists.AGENCY.map((o) => o.label)).toEqual(["Dept. of Health"]);
    expect(lists.BALL_WITH).toEqual([]);
    const other = await runAsTenant(B, () => getPicklists());
    expect(other.PAYER.map((o) => o.code)).toEqual(["BETA_CARE"]);
  });

  it("validates codes against the current org's list only", async () => {
    await runAsTenant(A, async () => {
      expect(await isPicklistCode("PAYER", "ACME_HEALTH")).toBe(true);
      expect(await isPicklistCode("PAYER", "BETA_CARE")).toBe(false); // org B's
      expect(await isPicklistCode("AGENCY", "ACME_HEALTH")).toBe(false); // wrong list
      expect(await isPicklistCode("PAYER", "NOPE")).toBe(false);
    });
  });

  it("pickers offer active options plus the row's current retired value", async () => {
    const { PAYER } = await runAsTenant(A, () => getPicklists());
    expect(pickerChoices(PAYER).map((o) => o.code)).toEqual(["ACME_HEALTH"]);
    expect(pickerChoices(PAYER, "OLD_PLAN").map((o) => o.code)).toEqual(["OLD_PLAN", "ACME_HEALTH"]);
  });

  it("the migration seeded CTK with the previously hardcoded lists", async () => {
    const lists = await runAsTenant({ id: "org_ctk", slug: "ctk" }, () => getPicklists());
    expect(lists.AGENCY.map((o) => o.label)).toEqual(["IDPH", "IDoA", "IDHS", "Other"]);
    expect(lists.PAYER.find((o) => o.code === "BCBS_IL")?.label).toBe("BCBS IL");
    expect(lists.BALL_WITH.map((o) => o.code)).toEqual(["CTK", "CLIENT", "GOVERNMENT"]);
  });

  it("derives stable codes from labels", () => {
    expect(codeFromLabel("BCBS IL")).toBe("BCBS_IL");
    expect(codeFromLabel("  Dept. of Health & Human Services ")).toBe("DEPT_OF_HEALTH_HUMAN_SERVICES");
    expect(codeFromLabel("Méridian-Care")).toBe("MERIDIAN_CARE");
    expect(codeFromLabel("!!!")).toBe("");
  });
});
