import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// Keys that used to be unique across the whole app are unique per org:
// two tenants can each have admin@…, a "Home Care" service type, an
// "intake" form, and so on.

const ORG_A = "org_uniq_a";
const ORG_B = "org_uniq_b";
let userA: { id: string };
let userB: { id: string };

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "uniq-a"], [ORG_B, "uniq-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  userA = await tenantDb(ORG_A).user.create({ data: { name: "A", email: "same@test.local", passwordHash: "x" } });
  userB = await tenantDb(ORG_B).user.create({ data: { name: "B", email: "same@test.local", passwordHash: "x" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("per-organization unique keys", () => {
  it("the same email exists once per org", async () => {
    expect(userA.id).not.toBe(userB.id);
    await expect(
      tenantDb(ORG_A).user.create({ data: { name: "dup", email: "same@test.local", passwordHash: "x" } })
    ).rejects.toThrow();
    const found = await tenantDb(ORG_B).user.findFirst({ where: { email: "same@test.local" } });
    expect(found?.id).toBe(userB.id);
  });

  it("service type names", async () => {
    await tenantDb(ORG_A).serviceType.create({ data: { name: "Home Care", hex: "#000000", textColor: "#ffffff", createdById: userA.id } });
    await tenantDb(ORG_B).serviceType.create({ data: { name: "Home Care", hex: "#000000", textColor: "#ffffff", createdById: userB.id } });
    await expect(tenantDb(ORG_A).serviceType.create({ data: { name: "Home Care", hex: "#000000", textColor: "#ffffff", createdById: userA.id } })).rejects.toThrow();
  });

  it("form slugs", async () => {
    const make = (orgId: string, userId: string) =>
      tenantDb(orgId).formTemplate.create({ data: { name: "Intake", slug: "intake", createdById: userId } });
    await make(ORG_A, userA.id);
    await make(ORG_B, userB.id);
    await expect(make(ORG_A, userA.id)).rejects.toThrow();
  });
});
