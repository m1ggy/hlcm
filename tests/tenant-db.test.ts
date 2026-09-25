import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { db, runAsTenant, tenantDb, TenantNotResolvedError } from "@/lib/db";

// Two tenants side by side; every assertion is "A can't see or touch B".
const ORG_A = "org_test_a";
const ORG_B = "org_test_b";

let userA: { id: string };
let userB: { id: string };

async function createUser(orgId: string, email: string) {
  return tenantDb(orgId).user.create({ data: { name: email, email, passwordHash: "x" } });
}

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "test-a"], [ORG_B, "test-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  userA = await createUser(ORG_A, "a@test.local");
  userB = await createUser(ORG_B, "b@test.local");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tenantDb creates", () => {
  it("stamps the caller's org without passing organizationId", async () => {
    const group = await tenantDb(ORG_B).clientGroup.create({ data: { name: "b-group", createdById: userB.id } });
    expect(group.organizationId).toBe(ORG_B);
  });

  it("stamps nested creates too", async () => {
    const group = await tenantDb(ORG_A).clientGroup.create({
      data: { name: "a-nested", createdById: userA.id, clients: { create: [{ name: "a-nested-client", createdById: userA.id }] } },
      include: { clients: true },
    });
    expect(group.clients.map((c) => c.organizationId)).toEqual([ORG_A]);
  });

  it("fails a create with no tenant context instead of guessing an org", async () => {
    await expect(prisma.clientGroup.create({ data: { name: "orphan", createdById: userA.id } })).rejects.toThrow();
  });
});

describe("tenantDb reads and writes are scoped", () => {
  let groupA: { id: string };
  let groupB: { id: string };

  beforeAll(async () => {
    groupA = await tenantDb(ORG_A).clientGroup.create({ data: { name: "scoped-a", createdById: userA.id } });
    groupB = await tenantDb(ORG_B).clientGroup.create({ data: { name: "scoped-b", createdById: userB.id } });
  });

  it("findMany/count only see the caller's rows", async () => {
    const a = tenantDb(ORG_A);
    const names = (await a.clientGroup.findMany()).map((g) => g.name);
    expect(names).toContain("scoped-a");
    expect(names).not.toContain("scoped-b");
    expect(await a.clientGroup.count({ where: { id: groupB.id } })).toBe(0);
  });

  it("findUnique on another org's id returns null", async () => {
    expect(await tenantDb(ORG_A).clientGroup.findUnique({ where: { id: groupB.id } })).toBeNull();
  });

  it("update/delete on another org's id throw not-found and leave it untouched", async () => {
    const a = tenantDb(ORG_A);
    await expect(a.clientGroup.update({ where: { id: groupB.id }, data: { name: "hacked" } })).rejects.toThrow();
    await expect(a.clientGroup.delete({ where: { id: groupB.id } })).rejects.toThrow();
    expect((await prisma.clientGroup.findUnique({ where: { id: groupB.id } }))?.name).toBe("scoped-b");
  });

  it("updateMany/deleteMany can't reach another org", async () => {
    const a = tenantDb(ORG_A);
    expect((await a.clientGroup.updateMany({ where: { id: groupB.id }, data: { name: "hacked" } })).count).toBe(0);
    expect((await a.clientGroup.deleteMany({ where: { id: groupB.id } })).count).toBe(0);
    expect(await prisma.clientGroup.count({ where: { id: groupB.id } })).toBe(1);
  });

  it("upsert on another org's id creates a new row in the caller's org", async () => {
    const row = await tenantDb(ORG_A).clientGroup.upsert({
      where: { id: groupB.id },
      create: { name: "upserted", createdById: userA.id },
      update: { name: "hacked" },
    });
    expect(row.organizationId).toBe(ORG_A);
    expect(row.id).not.toBe(groupB.id);
    expect((await prisma.clientGroup.findUnique({ where: { id: groupB.id } }))?.name).toBe("scoped-b");
  });

  it("aggregate/groupBy are scoped", async () => {
    const grouped = await tenantDb(ORG_A).clientGroup.groupBy({ by: ["organizationId"], _count: true });
    expect(grouped.map((g) => g.organizationId)).toEqual([ORG_A]);
  });

  it("own rows still work normally", async () => {
    const updated = await tenantDb(ORG_A).clientGroup.update({ where: { id: groupA.id }, data: { name: "renamed-a" } });
    expect(updated.name).toBe("renamed-a");
  });
});

describe("tenantDb transactions", () => {
  it("interactive transaction is scoped and stamps creates", async () => {
    const result = await tenantDb(ORG_B).$transaction(async (tx) => {
      const created = await tx.clientGroup.create({ data: { name: "tx-b", createdById: userB.id } });
      const seen = await tx.clientGroup.findMany({ where: { name: { in: ["tx-b", "scoped-a"] } } });
      return { org: created.organizationId, seen: seen.map((g) => g.name) };
    });
    expect(result).toEqual({ org: ORG_B, seen: ["tx-b"] });
  });

  it("interactive transaction rolls back every write on throw", async () => {
    await expect(
      tenantDb(ORG_B).$transaction(async (tx) => {
        await tx.clientGroup.create({ data: { name: "tx-rollback", createdById: userB.id } });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await prisma.clientGroup.count({ where: { name: "tx-rollback" } })).toBe(0);
  });

  it("rejects the array form", () => {
    const a = tenantDb(ORG_A) as unknown as { $transaction: (arg: unknown[]) => unknown };
    expect(() => a.$transaction([])).toThrow(/interactive form/);
  });

  it("rejects raw SQL", () => {
    const a = tenantDb(ORG_A) as unknown as { $queryRaw: unknown };
    expect(() => a.$queryRaw).toThrow(/isn't tenant-scoped/);
  });
});

describe("db (request-scoped)", () => {
  it("throws outside a request with no runAsTenant scope", async () => {
    await expect(db.clientGroup.findMany()).rejects.toBeInstanceOf(TenantNotResolvedError);
  });

  it("uses the runAsTenant scope", async () => {
    const names = await runAsTenant(ORG_B, async () => (await db.clientGroup.findMany()).map((g) => g.name));
    expect(names).toContain("b-group");
    expect(names).not.toContain("scoped-a");
  });

  it("supports interactive transactions", async () => {
    const org = await runAsTenant(ORG_A, () =>
      db.$transaction(async (tx) => (await tx.clientGroup.create({ data: { name: "db-tx", createdById: userA.id } })).organizationId)
    );
    expect(org).toBe(ORG_A);
  });
});
