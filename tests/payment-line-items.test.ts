import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";

// A manual invoice's payment can be recorded against one of its line items
// (Payment.lineItemId), and that link survives editing the invoice.

const ORG = { id: "org_payline", slug: "payline-co" };
let userId = "";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  saveBuffer: vi.fn(async () => ({ storageKey: "receipt.pdf" })),
  readStoredFile: vi.fn(),
  deleteStoredFile: vi.fn(),
}));
// Not importOriginal — the real module pulls in next-auth, which doesn't load
// outside Next.
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ user: { id: userId, role: "ACCOUNTANT" } })),
  requireSession: vi.fn(async () => ({ user: { id: userId, role: "ACCOUNTANT" } })),
  ForbiddenError: class extends Error {},
  UnauthorizedError: class extends Error {},
}));

const { addManualPayment, updatePayment, updateManualInvoiceDraft } = await import("@/lib/actions/invoices");

// Through tenantDb, not systemPrisma — Invoice.seq and every organizationId
// default read the tenant scope (current_org_id()).
async function makeInvoice(orgId: string, createdById: string) {
  const tdb = tenantDb(orgId);
  const client = await tdb.client.create({ data: { name: "Client", createdById } });
  return tdb.invoice.create({
    data: {
      clientId: client.id,
      createdById,
      status: "SENT",
      total: 300,
      taxAmount: 0,
      lineItems: {
        create: [
          { description: "Consulting", quantity: 2, unitPrice: 100, sortOrder: 0 },
          { description: "Filing", quantity: 1, unitPrice: 100, sortOrder: 1 },
        ],
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: { ...ORG, name: "Payline Co" } });
  forgetOrg(ORG.slug);
  const user = await prisma.user.create({
    data: { organizationId: ORG.id, name: "Accountant", email: "acct@payline.test", passwordHash: "x", role: "ACCOUNTANT" },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("payment line item binding", () => {
  it("records a payment against a line item and keeps it through an invoice edit", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    const [consulting, filing] = invoice.lineItems;

    await runAsTenant(ORG, () =>
      addManualPayment(invoice.id, { amount: 100, paidAt: "2026-09-01", paymentMethod: "Cash", lineItemId: filing.id })
    );
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(payment.lineItemId).toBe(filing.id);

    // Edit the lines: change the bound one, drop another, add a new one.
    await runAsTenant(ORG, () =>
      updateManualInvoiceDraft(invoice.id, {
        lineItems: [
          { id: filing.id, description: "Filing (state)", quantity: 1, unitPrice: 150 },
          { description: "Travel", quantity: 1, unitPrice: 50 },
        ],
      })
    );
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((li) => li.description)).toEqual(["Filing (state)", "Travel"]);
    expect(lines[0].id).toBe(filing.id);
    expect(lines.some((li) => li.id === consulting.id)).toBe(false);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).lineItemId).toBe(filing.id);

    // Unbinding goes back to the whole invoice.
    await runAsTenant(ORG, () =>
      updatePayment(payment.id, { amount: 100, paidAt: "2026-09-01", paymentMethod: "Cash", lineItemId: "" })
    );
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).lineItemId).toBeNull();
  });

  it("refuses to remove a line item that has payments recorded against it", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    const [consulting, filing] = invoice.lineItems;
    await runAsTenant(ORG, () =>
      addManualPayment(invoice.id, { amount: 50, paidAt: "2026-09-01", paymentMethod: "Cash", lineItemId: consulting.id })
    );

    await expect(
      runAsTenant(ORG, () =>
        updateManualInvoiceDraft(invoice.id, {
          lineItems: [{ id: filing.id, description: "Filing", quantity: 3, unitPrice: 100 }],
        })
      )
    ).rejects.toThrow(/"Consulting" has payments recorded against it/);
    expect(await prisma.invoiceLineItem.count({ where: { invoiceId: invoice.id } })).toBe(2);
  });

  it("refuses a line item from another invoice", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    const other = await makeInvoice(ORG.id, userId);

    await expect(
      runAsTenant(ORG, () =>
        addManualPayment(invoice.id, { amount: 50, paidAt: "2026-09-01", paymentMethod: "Cash", lineItemId: other.lineItems[0].id })
      )
    ).rejects.toThrow("That line item isn't on this invoice");
    expect(await prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });
});
