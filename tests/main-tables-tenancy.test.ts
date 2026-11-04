import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// The tables that came from main after the 2026-10-12 merge (caregiver
// visits, login activity, payroll) are tenant tables like every other:
// stamped with the creating org, invisible to other orgs, and unable to
// point at another org's rows. Pay periods are unique per org, not globally.

const ORG_A = "org_mt_a";
const ORG_B = "org_mt_b";
const START = new Date("2026-11-01");
const END = new Date("2026-11-15");

let userA: { id: string };
let userB: { id: string };
let recipientA: { id: string };
let periodA: { id: string };

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "mt-a"], [ORG_B, "mt-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  const a = tenantDb(ORG_A);
  const b = tenantDb(ORG_B);
  userA = await a.user.create({ data: { name: "A", email: "mt-a@test.local", passwordHash: "x", role: "CAREGIVER" } });
  userB = await b.user.create({ data: { name: "B", email: "mt-b@test.local", passwordHash: "x", role: "CAREGIVER" } });
  const clientA = await a.client.create({ data: { name: "Client A", createdById: userA.id } });
  recipientA = await a.careRecipient.create({ data: { name: "Recipient A", clientId: clientA.id, createdById: userA.id } });
  await a.visitShift.create({
    data: { careRecipientId: recipientA.id, caregiverId: userA.id, weekday: 1, startMinute: 540, endMinute: 600, createdById: userA.id },
  });
  await a.careIncident.create({
    data: { careRecipientId: recipientA.id, category: "OTHER", description: "x", reportedById: userA.id },
  });
  await a.loginEvent.create({ data: { userId: userA.id, success: true, method: "password", deviceType: "DESKTOP" } });
  periodA = await a.payPeriod.create({ data: { startDate: START, endDate: END } });
  await a.payrollPayment.create({
    data: {
      payPeriodId: periodA.id,
      userId: userA.id,
      hours: 1,
      breakHours: 0,
      grossAmount: 10,
      netAmount: 10,
      method: "CHECK",
      paidOn: END,
      markedById: userA.id,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("visits, login activity and payroll are per organization", () => {
  it("stamps every row with the creating organization", async () => {
    for (const rows of [
      await prisma.visitShift.findMany({ where: { careRecipientId: recipientA.id } }),
      await prisma.careIncident.findMany({ where: { careRecipientId: recipientA.id } }),
      await prisma.loginEvent.findMany({ where: { userId: userA.id } }),
      await prisma.payrollPayment.findMany({ where: { payPeriodId: periodA.id } }),
    ]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    }
    expect((await prisma.payPeriod.findUniqueOrThrow({ where: { id: periodA.id } })).organizationId).toBe(ORG_A);
  });

  it("is invisible to other organizations", async () => {
    const b = tenantDb(ORG_B);
    expect(await b.visitShift.count()).toBe(0);
    expect(await b.careIncident.count()).toBe(0);
    expect(await b.loginEvent.count()).toBe(0);
    expect(await b.payPeriod.count()).toBe(0);
    expect(await b.payrollPayment.count()).toBe(0);
  });

  it("lets each organization have its own pay period for the same dates", async () => {
    const periodB = await tenantDb(ORG_B).payPeriod.create({ data: { startDate: START, endDate: END } });
    expect(periodB.organizationId).toBe(ORG_B);
    await expect(tenantDb(ORG_A).payPeriod.create({ data: { startDate: START, endDate: END } })).rejects.toThrow();
  });

  it("can't be linked to from another organization", async () => {
    const b = tenantDb(ORG_B);
    await expect(
      b.visitShift.create({
        data: { careRecipientId: recipientA.id, caregiverId: userB.id, weekday: 1, startMinute: 0, endMinute: 60, createdById: userB.id },
      })
    ).rejects.toThrow();
    await expect(
      b.payrollPayment.create({
        data: { payPeriodId: periodA.id, userId: userB.id, hours: 1, breakHours: 0, grossAmount: 1, netAmount: 1, method: "CHECK", paidOn: END, markedById: userB.id },
      })
    ).rejects.toThrow();
  });
});
