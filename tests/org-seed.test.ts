import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { seedOrganization } from "@/lib/org-seed";
import { ALL_STAGES } from "@/lib/pipeline-stage-catalog";
import { getPicklists } from "@/lib/picklists";

// seedOrganization gives a new tenant a usable, generic starting setup (3e).

const org = { id: "org_seed_acme", slug: "acme", name: "Acme Licensing" };
let ownerId: string;

beforeAll(async () => {
  await prisma.organization.upsert({ where: { id: org.id }, create: org, update: {} });
  ownerId = (await tenantDb(org.id).user.create({ data: { name: "Owner", email: "owner@acme.test", passwordHash: "x", role: "OWNER" } })).id;
  await seedOrganization({ org, ownerId });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedOrganization", () => {
  const acme = () => tenantDb(org.id);

  it("seeds the full pipeline stage catalog, with roles and backward moves", async () => {
    const stages = await acme().pipelineStage.findMany();
    expect(stages).toHaveLength(ALL_STAGES.length);
    expect(stages.filter((s) => s.role === "SUPERVISOR_REVIEW").map((s) => s.abbrev).sort()).toEqual(["S1 SVR", "S2 SVR", "SVR", "SVR"]);
    const svr = stages.find((s) => s.pipeline === "HOME_CARE" && s.abbrev === "SVR")!;
    const cap = stages.find((s) => s.pipeline === "HOME_CARE" && s.abbrev === "CAP")!;
    expect(svr.allowedBackwardStageIds).toEqual([cap.id]);
  });

  it("names the org instead of CTK in stage names", async () => {
    const names = (await acme().pipelineStage.findMany({ select: { name: true } })).map((s) => s.name);
    expect(names).toContain("Acme Licensing Internal Mock Scheduled");
    expect(names.some((n) => /\bCTK\b/.test(n))).toBe(false);
  });

  it("seeds generic case types, picklists and a default invoice profile", async () => {
    expect((await acme().caseType.findMany()).map((c) => c.name).sort()).toEqual(
      ["Change of Ownership", "New", "Post-License/Ongoing", "Renewal"]
    );
    const lists = await runAsTenant(org, () => getPicklists());
    expect(lists.BALL_WITH.map((o) => o.label)).toEqual(["Acme Licensing", "Client", "Government"]);
    expect(lists.AGENCY.map((o) => o.code)).toEqual(["OTHER"]);
    const profiles = await acme().invoiceProfile.findMany();
    expect(profiles.map((p) => [p.name, p.isDefault])).toEqual([["Acme Licensing", true]]);
  });

  it("is idempotent", async () => {
    await seedOrganization({ org, ownerId });
    expect(await acme().pipelineStage.count()).toBe(ALL_STAGES.length);
    expect(await acme().caseType.count()).toBe(4);
    expect(await acme().picklistOption.count()).toBe(5);
    expect(await acme().invoiceProfile.count()).toBe(1);
  });

  it("touches only the new org", async () => {
    expect(await tenantDb("org_ctk").caseType.count({ where: { createdById: ownerId } })).toBe(0);
  });
});
