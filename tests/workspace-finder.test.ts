import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";
import { findWorkspacesForEmail } from "@/lib/platform";

// "Find your workspace" lookup (5e).

const orgs = [
  { id: "org_find_a", slug: "find-a", name: "Alpha", status: "ACTIVE" as const },
  { id: "org_find_b", slug: "find-b", name: "Beta", status: "ACTIVE" as const },
  { id: "org_find_s", slug: "find-s", name: "Suspended Co", status: "SUSPENDED" as const },
];

beforeAll(async () => {
  for (const org of orgs) await prisma.organization.upsert({ where: { id: org.id }, create: org, update: {} });
  const mk = (orgId: string, email: string, active = true) =>
    tenantDb(orgId).user.create({ data: { name: "U", email, passwordHash: "x", active } });
  await mk("org_find_a", "multi@find.test");
  await mk("org_find_b", "Multi@Find.test");
  await mk("org_find_s", "multi@find.test");
  await mk("org_platform", "multi@find.test");
  await mk("org_find_a", "gone@find.test", false);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("findWorkspacesForEmail", () => {
  it("lists active workspaces with an active account, case-insensitively", async () => {
    expect(await findWorkspacesForEmail("MULTI@find.test")).toEqual([
      { name: "Alpha", slug: "find-a" },
      { name: "Beta", slug: "find-b" },
    ]);
  });

  it("skips suspended orgs, the platform org and deactivated accounts", async () => {
    expect(await findWorkspacesForEmail("gone@find.test")).toEqual([]);
    expect(await findWorkspacesForEmail("nobody@find.test")).toEqual([]);
  });
});
