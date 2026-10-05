import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// The multi-service client tables (from main) are tenant tables like every
// other: a service, its team and its adjustments belong to the client's
// organization, other organizations can't see them, and nothing in one
// organization can point at another's service.

const ORG_A = "org_cs_a";
const ORG_B = "org_cs_b";

let serviceA: { id: string };
let userB: { id: string };
let clientB: { id: string };
let clientAId = "";

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "cs-a"], [ORG_B, "cs-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  const a = tenantDb(ORG_A);
  const b = tenantDb(ORG_B);
  const userA = await a.user.create({ data: { name: "A", email: "cs-a@test.local", passwordHash: "x" } });
  userB = await b.user.create({ data: { name: "B", email: "cs-b@test.local", passwordHash: "x" } });
  const clientA = await a.client.create({ data: { name: "Client A", createdById: userA.id } });
  clientAId = clientA.id;
  clientB = await b.client.create({ data: { name: "Client B", createdById: userB.id } });
  serviceA = await a.clientService.create({
    data: { clientId: clientA.id, name: "Licensing", createdById: userA.id, team: { create: [{ userId: userA.id }] } },
  });
  await a.serviceAdjustment.create({ data: { clientServiceId: serviceA.id, amount: -50, reason: "Discount", date: new Date(), createdById: userA.id } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("client services are per organization", () => {
  it("stamps every row with the creating organization", async () => {
    const service = await prisma.clientService.findUniqueOrThrow({ where: { id: serviceA.id }, include: { team: true, adjustments: true } });
    expect(service.organizationId).toBe(ORG_A);
    expect(service.team.map((t) => t.organizationId)).toEqual([ORG_A]);
    expect(service.adjustments.map((t) => t.organizationId)).toEqual([ORG_A]);
  });

  it("is invisible to other organizations", async () => {
    const b = tenantDb(ORG_B);
    expect(await b.clientService.findMany()).toEqual([]);
    expect(await b.clientService.findUnique({ where: { id: serviceA.id } })).toBeNull();
    expect(await b.serviceAdjustment.count()).toBe(0);
    expect(await b.clientServiceAssignee.count()).toBe(0);
  });

  it("can't be linked to from another organization", async () => {
    const b = tenantDb(ORG_B);
    await expect(
      b.task.create({ data: { label: "x", clientServiceId: serviceA.id, createdById: userB.id } })
    ).rejects.toThrow();
    await expect(b.note.create({ data: { body: "x", clientId: clientB.id, clientServiceId: serviceA.id, authorId: userB.id } })).rejects.toThrow();
    await expect(
      b.serviceAdjustment.create({ data: { clientServiceId: serviceA.id, amount: 1, reason: "x", date: new Date(), createdById: userB.id } })
    ).rejects.toThrow();
    await expect(b.clientService.create({ data: { clientId: clientAId, name: "x", createdById: userB.id } })).rejects.toThrow();
  });
});

