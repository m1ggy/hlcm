import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { lineBalances } from "@/lib/invoice-format";

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

const { addManualPayment, addPaidLineItem, createManualInvoice, updatePayment, updateManualInvoiceDraft } = await import("@/lib/actions/invoices");

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

describe("running invoice", () => {
  it("takes a new line on a paid invoice, back to partly paid, and never below what's been paid", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    const [consulting, filing] = invoice.lineItems;
    await runAsTenant(ORG, () => addManualPayment(invoice.id, { amount: 300, paidAt: "2026-09-01", paymentMethod: "Zelle", lineItemId: null }));
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");

    // Next month's charge goes on the same invoice.
    const lines = [
      { id: consulting.id, description: "Consulting", quantity: 2, unitPrice: 100 },
      { id: filing.id, description: "Filing", quantity: 1, unitPrice: 100 },
    ];
    await runAsTenant(ORG, () =>
      updateManualInvoiceDraft(invoice.id, { lineItems: [...lines, { description: "2nd Monthly Retainer", quantity: 1, unitPrice: 1000 }] })
    );
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.total).toBe(1300);
    expect(after.status).toBe("PARTIALLY_PAID");

    await expect(
      runAsTenant(ORG, () => updateManualInvoiceDraft(invoice.id, { lineItems: [{ id: filing.id, description: "Filing", quantity: 1, unitPrice: 100 }] }))
    ).rejects.toThrow(/can't be less than/);
  });
});

describe("lineBalances", () => {
  it("fills lines oldest first, after payments made for a specific line", () => {
    const lines = [
      { id: "a", quantity: 1, unitPrice: 1000 },
      { id: "b", quantity: 1, unitPrice: 1000 },
      { id: "c", quantity: 1, unitPrice: 1000 },
    ];
    expect(lineBalances(lines, 1000)).toEqual([
      { amount: 1000, paid: 1000, due: 0 },
      { amount: 1000, paid: 0, due: 1000 },
      { amount: 1000, paid: 0, due: 1000 },
    ]);
    // 500 for line c, 700 for the invoice as a whole.
    expect(
      lineBalances(lines, 1200, [
        { amount: 500, lineItemId: "c" },
        { amount: 700, lineItemId: null },
      ])
    ).toEqual([
      { amount: 1000, paid: 700, due: 300 },
      { amount: 1000, paid: 0, due: 1000 },
      { amount: 1000, paid: 500, due: 500 },
    ]);
    // A line overpaid spills the rest onto the others.
    expect(lineBalances(lines.slice(0, 2), 1500, [{ amount: 1500, lineItemId: "b" }])).toEqual([
      { amount: 1000, paid: 500, due: 500 },
      { amount: 1000, paid: 1000, due: 0 },
    ]);
    expect(lineBalances([{ quantity: 2.5, unitPrice: 40 }], null)).toEqual([{ amount: 100, paid: 0, due: 100 }]);
  });
});

describe("paid items", () => {
  const downpayment = { description: "Downpayment", amount: 500, paidAt: "2026-11-01", paymentMethod: "Zelle" };

  it("adds a paid line with its payment and receipt, leaving the balance where it was", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    const result = await runAsTenant(ORG, () => addPaidLineItem(invoice.id, downpayment));
    expect(result.ok).toBe(true);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: { include: { receipt: true } } },
    });
    expect(after.total).toBe(800);
    expect(after.amountPaid).toBe(500);
    expect(after.status).toBe("PARTIALLY_PAID");
    expect(after.lineItems.map((li) => li.description)).toEqual(["Consulting", "Filing", "Downpayment"]);
    const line = after.lineItems[2];
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ lineItemId: line.id, amount: 500, paymentMethod: "Zelle" });
    expect(after.payments[0].receipt?.storageKey).toBe("receipt.pdf");
    // Still owed: the two unpaid lines.
    expect(lineBalances(after.lineItems, after.amountPaid, after.payments).map((b) => b.due)).toEqual([200, 100, 0]);
  });

  it("keeps a paid invoice paid", async () => {
    const invoice = await makeInvoice(ORG.id, userId);
    await runAsTenant(ORG, () => addManualPayment(invoice.id, { amount: 300, paidAt: "2026-09-01", paymentMethod: "Cash", lineItemId: null }));
    await runAsTenant(ORG, () => addPaidLineItem(invoice.id, downpayment));
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after).toMatchObject({ total: 800, amountPaid: 800, status: "PAID" });
  });

  it("can start a new invoice with a downpayment already on it", async () => {
    const client = await tenantDb(ORG.id).client.create({ data: { name: "New Client", createdById: userId } });
    const result = await runAsTenant(ORG, () =>
      createManualInvoice({
        clientId: client.id,
        lineItems: [{ description: "Monthly retainer", quantity: 1, unitPrice: 1000 }],
        paidItems: [downpayment],
      })
    );
    if (!result.ok) throw new Error(result.error);
    const created = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.data.id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: { include: { receipt: true } } },
    });
    expect(created).toMatchObject({ total: 1500, amountPaid: 500, status: "PARTIALLY_PAID", paymentMethod: "Zelle" });
    expect(created.lineItems.map((li) => li.description)).toEqual(["Monthly retainer", "Downpayment"]);
    expect(created.payments[0].lineItemId).toBe(created.lineItems[1].id);
    expect(created.payments[0].receipt?.storageKey).toBe("receipt.pdf");

    // Only paid items is fine too, and needs nothing more.
    const onlyPaid = await runAsTenant(ORG, () => createManualInvoice({ clientId: client.id, lineItems: [], paidItems: [downpayment] }));
    if (!onlyPaid.ok) throw new Error(onlyPaid.error);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: onlyPaid.data.id } })).toMatchObject({ total: 500, status: "PAID" });

    const empty = await runAsTenant(ORG, () => createManualInvoice({ clientId: client.id, lineItems: [] }));
    expect(empty).toMatchObject({ ok: false, error: "Add at least one line item" });
  });
});
