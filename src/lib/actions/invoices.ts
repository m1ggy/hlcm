"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import {
  createCustomer,
  createDraftInvoice,
  createInvoiceItem,
  finalizeInvoice,
  sendInvoice as sendInvoiceRemote,
  voidInvoiceRemote,
  payInvoiceOutOfBand,
} from "@/lib/stripe";
import type { $Enums } from "@/generated/prisma/client";

const MANAGE_ROLES: AppRole[] = ["ADMIN", "MANAGER"];

const invoiceInclude = {
  client: {
    select: {
      id: true,
      name: true,
      businessName: true,
      businessEmail: true,
      ownerEmail: true,
      stripeCustomerId: true,
      billingAddressLine1: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      billingCountry: true,
    },
  },
  application: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
} as const;

export async function listInvoices(filters?: { status?: $Enums.InvoiceStatus; clientId?: string }) {
  await requireRole(MANAGE_ROLES);

  return prisma.invoice.findMany({
    where: {
      status: filters?.status,
      clientId: filters?.clientId || undefined,
    },
    include: invoiceInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvoice(id: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
}

export async function getInvoiceAuditLog(invoiceId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.auditLog.findMany({
    where: { entityType: "Invoice", entityId: invoiceId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

const invoiceInputSchema = z.object({
  clientId: z.string().min(1),
  applicationId: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

// Pre-send estimate only (no tax) — the real total + tax come back from
// Stripe Tax once the invoice is finalized.
function subtotalOf(lineItems: { quantity: number; unitPrice: number }[]) {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

export async function createInvoice(input: z.infer<typeof invoiceInputSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = invoiceInputSchema.parse(input);

  const invoice = await prisma.invoice.create({
    data: {
      clientId: parsed.clientId,
      applicationId: parsed.applicationId || undefined,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      notes: parsed.notes,
      total: subtotalOf(parsed.lineItems),
      createdById: session.user.id,
      lineItems: {
        create: parsed.lineItems.map((li, index) => ({ ...li, sortOrder: index })),
      },
    },
    include: invoiceInclude,
  });

  await recordAudit({ entityType: "Invoice", entityId: invoice.id, action: "create", actorId: session.user.id });

  revalidatePath("/invoices");
  return invoice;
}

export async function updateInvoice(id: string, input: z.infer<typeof invoiceInputSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = invoiceInputSchema.parse(input);

  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (before.status !== "DRAFT") throw new Error("Only draft invoices can be edited");

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        clientId: parsed.clientId,
        applicationId: parsed.applicationId || null,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        notes: parsed.notes,
        total: subtotalOf(parsed.lineItems),
        lineItems: {
          create: parsed.lineItems.map((li, index) => ({ ...li, sortOrder: index })),
        },
      },
      include: invoiceInclude,
    });
  });

  await recordAudit({ entityType: "Invoice", entityId: id, action: "update", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return invoice;
}

export async function deleteInvoice(id: string) {
  const session = await requireRole(MANAGE_ROLES);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be deleted");

  await prisma.invoice.delete({ where: { id } });
  await recordAudit({ entityType: "Invoice", entityId: id, action: "delete", actorId: session.user.id });

  revalidatePath("/invoices");
}

export async function voidInvoice(id: string) {
  const session = await requireRole(MANAGE_ROLES);
  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (before.status === "PAID") throw new Error("A paid invoice can't be voided");

  if (before.stripeInvoiceId) await voidInvoiceRemote(before.stripeInvoiceId);
  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  await recordAudit({ entityType: "Invoice", entityId: id, action: "void", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

// Manual override for a payment collected outside Stripe (check/cash).
// Still tells Stripe about it (paid_out_of_band) so Stripe's own invoice
// stays accurate — the webhook's invoice.paid handler will also fire and
// no-op since we update here first.
export async function markInvoicePaid(id: string) {
  const session = await requireRole(MANAGE_ROLES);
  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (before.status === "PAID") return;

  if (before.stripeInvoiceId) await payInvoiceOutOfBand(before.stripeInvoiceId);
  await prisma.invoice.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  await recordAudit({ entityType: "Invoice", entityId: id, action: "mark_paid", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

// A transaction paid before any invoice existed — cash handed over, a wire
// that landed, a check already cashed. Recorded straight into PAID with
// stripeInvoiceId left null forever: no customer, no draft, no email, no
// Stripe involvement at all. That's also how isManualPayment (see
// src/components/invoices/invoice-status-badge.tsx) tells these apart from
// a normal invoice later.
const manualPaymentInputSchema = z.object({
  clientId: z.string().min(1),
  applicationId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  paidAt: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  amountPaid: z.coerce.number().positive("Amount received must be greater than 0"),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

// A duplicate typed invoiceNumber is the one way this insert can fail on a
// constraint rather than validation — surfaced as a plain, readable error
// instead of Prisma's raw P2002 (there's no existing convention for this in
// the codebase to follow, so this is deliberately duck-typed on `.code`
// rather than importing Prisma's error class).
function friendlyInvoiceNumberError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new Error("That invoice number is already in use on another invoice");
  }
  throw error;
}

export async function recordManualPayment(input: z.infer<typeof manualPaymentInputSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = manualPaymentInputSchema.parse(input);
  const total = subtotalOf(parsed.lineItems);

  const invoice = await prisma.invoice
    .create({
      data: {
        clientId: parsed.clientId,
        applicationId: parsed.applicationId || undefined,
        invoiceNumber: parsed.invoiceNumber || undefined,
        notes: parsed.notes,
        status: parsed.amountPaid >= total ? "PAID" : "PARTIALLY_PAID",
        paidAt: new Date(parsed.paidAt),
        paymentMethod: parsed.paymentMethod,
        amountPaid: parsed.amountPaid,
        total,
        taxAmount: 0,
        createdById: session.user.id,
        lineItems: {
          create: parsed.lineItems.map((li, index) => ({ ...li, sortOrder: index })),
        },
      },
      include: invoiceInclude,
    })
    .catch(friendlyInvoiceNumberError);

  await recordAudit({
    entityType: "Invoice",
    entityId: invoice.id,
    action: "record_manual_payment",
    actorId: session.user.id,
    newValue: parsed.paymentMethod,
  });

  revalidatePath("/invoices");
  return invoice;
}

const additionalPaymentInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidAt: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

// Tops up a PARTIALLY_PAID manual record with another payment — the rest of
// a balance coming in later (e.g. a deposit, then the remainder). Flips to
// PAID once the running total covers the invoice; stays PARTIALLY_PAID
// otherwise. Refuses anything that isn't itself a manual record already
// mid-payment — a real Stripe-bound invoice's paid state comes from the
// webhook, not this.
export async function addManualPayment(id: string, input: z.infer<typeof additionalPaymentInputSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = additionalPaymentInputSchema.parse(input);

  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (before.stripeInvoiceId) throw new Error("This invoice isn't a manually-recorded payment");
  if (before.status !== "PARTIALLY_PAID") throw new Error("This invoice isn't partially paid");

  const amountPaid = (before.amountPaid ?? 0) + parsed.amount;
  const total = before.total ?? 0;

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      amountPaid,
      paidAt: new Date(parsed.paidAt),
      paymentMethod: parsed.paymentMethod,
      status: amountPaid >= total ? "PAID" : "PARTIALLY_PAID",
    },
    include: invoiceInclude,
  });

  await recordAudit({
    entityType: "Invoice",
    entityId: id,
    action: "record_manual_payment",
    actorId: session.user.id,
    newValue: `${parsed.paymentMethod} (+$${parsed.amount.toFixed(2)})`,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return invoice;
}

// --- Send ---------------------------------------------------------------

// First send: creates the Stripe Customer (cached on Client), the Stripe
// Invoice + its line items, finalizes it (Stripe Tax computes the real tax
// here), and stores everything back onto our row. Resend: the Stripe
// invoice already exists — just re-trigger the email.
export async function sendInvoice(id: string) {
  const session = await requireRole(MANAGE_ROLES);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });

  if (invoice.stripeInvoiceId) {
    await sendInvoiceRemote(invoice.stripeInvoiceId);
    await prisma.invoice.update({ where: { id }, data: { sentAt: new Date() } });
    await recordAudit({ entityType: "Invoice", entityId: id, action: "send", actorId: session.user.id });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return;
  }

  const recipientEmail = invoice.client.businessEmail ?? invoice.client.ownerEmail;
  if (!recipientEmail) throw new Error("Client has no email on file — add one before sending");

  const { billingAddressLine1, billingCity, billingState, billingPostalCode, billingCountry } = invoice.client;
  if (!billingState || !billingPostalCode) {
    throw new Error(
      "This client is missing a billing address (state + ZIP) — Stripe Tax needs it to calculate tax. Add one on the client's page first."
    );
  }

  let customerId = invoice.client.stripeCustomerId;
  if (!customerId) {
    const customer = await createCustomer({
      email: recipientEmail,
      name: invoice.client.businessName ?? invoice.client.name,
      address: {
        line1: billingAddressLine1 ?? undefined,
        city: billingCity ?? undefined,
        state: billingState,
        postal_code: billingPostalCode,
        country: billingCountry ?? "US",
      },
      metadata: { clientId: invoice.client.id },
    });
    customerId = customer.id;
    await prisma.client.update({ where: { id: invoice.client.id }, data: { stripeCustomerId: customerId } });
  }

  const draft = await createDraftInvoice({
    customerId,
    daysUntilDue: invoice.dueDate
      ? Math.max(0, Math.ceil((invoice.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 30,
    invoiceId: invoice.id,
  });

  for (const li of invoice.lineItems) {
    await createInvoiceItem({
      customerId,
      stripeInvoiceId: draft.id,
      description: `${li.description} (${li.quantity} × $${li.unitPrice.toFixed(2)})`,
      amountCents: Math.round(li.quantity * li.unitPrice * 100),
    });
  }

  const finalized = await finalizeInvoice(draft.id);
  await sendInvoiceRemote(finalized.id);

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      stripeInvoiceId: finalized.id,
      stripeInvoiceNumber: finalized.number,
      hostedInvoiceUrl: finalized.hosted_invoice_url,
      invoicePdfUrl: finalized.invoice_pdf,
      total: finalized.total / 100,
      taxAmount: (finalized.tax ?? 0) / 100,
    },
  });

  await recordAudit({ entityType: "Invoice", entityId: id, action: "send", actorId: session.user.id, newValue: recipientEmail });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return updated;
}
