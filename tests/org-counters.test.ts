import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// Invoice.seq / Receipt.seq count per organization (org_counters +
// next_invoice_seq()/next_receipt_seq(); see the per_org_counters migration).

const ORG_A = "org_ctr_a";
const ORG_B = "org_ctr_b";
const setup: Record<string, { userId: string; clientId: string }> = {};

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "ctr-a"], [ORG_B, "ctr-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
    const user = await tenantDb(id).user.create({ data: { name: slug, email: `${slug}@test.local`, passwordHash: "x" } });
    const client = await tenantDb(id).client.create({ data: { name: `${slug} client`, createdById: user.id } });
    setup[id] = { userId: user.id, clientId: client.id };
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function createInvoice(orgId: string) {
  const { userId, clientId } = setup[orgId];
  return tenantDb(orgId).invoice.create({ data: { clientId, createdById: userId } });
}

describe("per-organization invoice numbering", () => {
  it("each org counts from 1, independently", async () => {
    const a1 = await createInvoice(ORG_A);
    const a2 = await createInvoice(ORG_A);
    const b1 = await createInvoice(ORG_B);
    const a3 = await createInvoice(ORG_A);
    expect([a1.seq, a2.seq, a3.seq]).toEqual([1, 2, 3]);
    expect(b1.seq).toBe(1);
  });

  it("parallel creates in one org get distinct, gap-free numbers", async () => {
    const before = (await tenantDb(ORG_B).invoice.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
    const created = await Promise.all(Array.from({ length: 8 }, () => createInvoice(ORG_B)));
    const seqs = created.map((i) => i.seq).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 8 }, (_, i) => before + 1 + i));
  });

  it("a rolled-back create doesn't burn a number", async () => {
    const before = (await tenantDb(ORG_A).invoice.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
    await expect(
      tenantDb(ORG_A).$transaction(async (tx) => {
        await tx.invoice.create({ data: { clientId: setup[ORG_A].clientId, createdById: setup[ORG_A].userId } });
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect((await createInvoice(ORG_A)).seq).toBe(before + 1);
  });

  it("receipts count per org too", async () => {
    const orgId = ORG_A;
    const { userId } = setup[orgId];
    const invoice = await createInvoice(orgId);
    const db = tenantDb(orgId);
    const receiptFor = async () => {
      const payment = await db.payment.create({ data: { invoiceId: invoice.id, amount: 1, paymentMethod: "cash", paidAt: new Date(), recordedById: userId } });
      return db.receipt.create({ data: { paymentId: payment.id, invoiceId: invoice.id, storageKey: "" } });
    };
    expect([(await receiptFor()).seq, (await receiptFor()).seq]).toEqual([1, 2]);
  });
});
