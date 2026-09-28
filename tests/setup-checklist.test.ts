import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { dismissSetupChecklist, getSetupChecklist } from "@/lib/setup-checklist";

// The new-owner "Set up your workspace" checklist: steps tick themselves off
// from the workspace's own data, and the card is gone once dismissed.

const ORG = { id: "org_setup", slug: "setup-co" };

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: { ...ORG, name: "Setup Co" } });
  await prisma.user.create({ data: { organizationId: ORG.id, name: "Owner", email: "owner@setup.test", passwordHash: "x", role: "OWNER" } });
  forgetOrg(ORG.slug);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const done = (steps: Awaited<ReturnType<typeof getSetupChecklist>>) =>
  Object.fromEntries((steps ?? []).map((s) => [s.id, s.done]));

describe("getSetupChecklist", () => {
  it("starts with nothing done, then ticks steps off as the workspace fills in", async () => {
    expect(done(await runAsTenant(ORG, getSetupChecklist))).toEqual({ organization: false, team: false, stripe: false, lists: false, project: false });

    await prisma.organization.update({ where: { id: ORG.id }, data: { timezone: "America/New_York", replyToEmail: "hi@setup.test" } });
    forgetOrg(ORG.slug);
    const mate = await prisma.user.create({ data: { organizationId: ORG.id, name: "Teammate", email: "mate@setup.test", passwordHash: "x", role: "STAFF" } });
    await prisma.project.create({ data: { organizationId: ORG.id, name: "First", createdById: mate.id } });

    expect(done(await runAsTenant(ORG, getSetupChecklist))).toMatchObject({ organization: true, team: true, stripe: false, project: true });
  });

  it("is gone once dismissed", async () => {
    await dismissSetupChecklist(ORG.id);
    await expect(runAsTenant(ORG, getSetupChecklist)).resolves.toBeNull();
  });
});
