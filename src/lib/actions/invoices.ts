"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { getInvoiceProfile, getDefaultInvoiceProfile, getInvoiceLogo, parseCcEmails } from "@/lib/invoice-profiles";
import { displayInvoiceNumber } from "@/lib/invoice-format";
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
  invoiceProfile: { select: { id: true, name: true } },
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
  if (isManual(before)) throw new Error("Use 'Record payment' for a manually-recorded invoice");

  if (before.stripeInvoiceId) await payInvoiceOutOfBand(before.stripeInvoiceId);
  await prisma.invoice.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  await recordAudit({ entityType: "Invoice", entityId: id, action: "mark_paid", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

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

// A PAID or PARTIALLY_PAID invoice that never got a Stripe invoice — see
// isManualInvoice in src/components/invoices/invoice-status-badge.tsx for
// the fuller version of this check (this one's inlined to avoid importing a
// client-only component module into a "use server" action file).
function isManual(invoice: { status: string; stripeInvoiceId: string | null }) {
  return !invoice.stripeInvoiceId && invoice.status !== "DRAFT";
}

const createManualInvoiceSchema = z.object({
  clientId: z.string().min(1),
  applicationId: z.string().optional(),
  invoiceProfileId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

// The main way to bill a client outside Stripe entirely — no draft, no
// Send, no card payment page. Always created unpaid (status SENT, exactly
// like a Stripe invoice right after Send — nothing left to do but wait for
// payment); recording money against it is a separate step (addManualPayment
// below), whether that happens the same day or weeks later.
export async function createManualInvoice(input: z.infer<typeof createManualInvoiceSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = createManualInvoiceSchema.parse(input);
  const total = subtotalOf(parsed.lineItems);

  // Resolved server-side rather than left null — every manual invoice
  // should have a definite billing identity, even if the dialog somehow
  // submitted without picking one.
  const profileId = parsed.invoiceProfileId || (await getDefaultInvoiceProfile())?.id;

  const invoice = await prisma.invoice
    .create({
      data: {
        clientId: parsed.clientId,
        applicationId: parsed.applicationId || undefined,
        invoiceProfileId: profileId,
        invoiceNumber: parsed.invoiceNumber || undefined,
        issueDate: parsed.issueDate ? new Date(parsed.issueDate) : undefined,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
        notes: parsed.notes,
        status: "SENT",
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

  await recordAudit({ entityType: "Invoice", entityId: invoice.id, action: "create_manual", actorId: session.user.id });

  revalidatePath("/invoices");
  return invoice;
}

const additionalPaymentInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidAt: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

// Records a payment against a manual invoice — the first one (bringing it
// off SENT) or another installment on top of an existing PARTIALLY_PAID
// balance; same action either way. Flips to PAID once the running total
// covers the invoice, which fires the (idempotent, manual-invoices-only)
// thank-you email — see sendManualPaymentThankYouEmail. Refuses anything
// that isn't itself a manual invoice awaiting payment — a real Stripe-bound
// invoice's paid state comes from the webhook, not this.
export async function addManualPayment(id: string, input: z.infer<typeof additionalPaymentInputSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = additionalPaymentInputSchema.parse(input);

  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (!isManual(before)) throw new Error("This invoice isn't a manually-recorded one");
  if (before.status !== "SENT" && before.status !== "PARTIALLY_PAID") {
    throw new Error("This invoice isn't awaiting payment");
  }

  const amountPaid = (before.amountPaid ?? 0) + parsed.amount;
  const total = before.total ?? 0;
  const newStatus = amountPaid >= total ? "PAID" : "PARTIALLY_PAID";

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      amountPaid,
      paidAt: new Date(parsed.paidAt),
      paymentMethod: parsed.paymentMethod,
      status: newStatus,
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

  if (newStatus === "PAID") after(() => sendManualPaymentThankYouEmail(invoice.id));

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return invoice;
}

// Fires once, ever, per invoice — paidEmailSentAt is checked immediately
// before sending and only ever set right after a successful send, so a
// retry (or two overlapping calls) can't double-email the client. Runs
// after the response (see the `after()` call above) so a slow PDF
// render/Resend call never delays the payment-recording action itself; a
// failure here is logged, not thrown — the payment is already recorded
// regardless of whether this email goes out.
async function sendManualPaymentThankYouEmail(invoiceId: string) {
  try {
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude });
    if (invoice.paidEmailSentAt) return;

    const recipientEmail = invoice.client.businessEmail ?? invoice.client.ownerEmail;
    if (!recipientEmail) return;

    const number = displayInvoiceNumber(invoice);
    const profile = await getInvoiceProfile(invoice.invoiceProfileId);
    const logo = await getInvoiceLogo(profile);
    const pdfBytes = await generateInvoicePdf({ ...invoice, logo, footerText: profile?.footerText ?? null, profileName: profile?.name ?? null });

    await sendEmail({
      to: recipientEmail,
      cc: parseCcEmails(profile?.ccEmails ?? null),
      subject: `Thank you for your payment — Invoice ${number}`,
      html: renderEmailLayout({
        heading: "Payment received",
        bodyHtml: `<p style="margin:0 0 8px">Thank you for your payment on invoice ${number} — $${(invoice.total ?? 0).toFixed(2)} received in full.</p><p style="margin:0">A copy of the invoice is attached for your records.</p>`,
        preheader: `Payment received for invoice ${number}`,
      }),
      attachments: [{ filename: `invoice-${number}.pdf`, content: pdfBytes }],
    });

    await prisma.invoice.update({ where: { id: invoiceId }, data: { paidEmailSentAt: new Date() } });
  } catch (error) {
    console.error("Failed to send payment thank-you email:", error);
  }
}

// A plain courtesy copy of the invoice PDF — separate from the automatic
// thank-you-for-payment email above. Only while the invoice is still
// awaiting payment (once PAID, the thank-you email is the one that goes
// out); tracks lastSentAt so the invoice detail page can show when this
// was last used.
export async function sendManualInvoicePdf(id: string) {
  const session = await requireRole(MANAGE_ROLES);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });

  if (!isManual(invoice)) throw new Error("This invoice isn't a manually-recorded one");
  if (invoice.status === "PAID" || invoice.status === "VOID") {
    throw new Error("This invoice is no longer awaiting payment");
  }

  const recipientEmail = invoice.client.businessEmail ?? invoice.client.ownerEmail;
  if (!recipientEmail) throw new Error("Client has no email on file — add one before sending");

  const number = displayInvoiceNumber(invoice);
  const profile = await getInvoiceProfile(invoice.invoiceProfileId);
  const logo = await getInvoiceLogo(profile);
  const pdfBytes = await generateInvoicePdf({ ...invoice, logo, footerText: profile?.footerText ?? null, profileName: profile?.name ?? null });
  const amountDue = (invoice.total ?? 0) - (invoice.amountPaid ?? 0);

  await sendEmail({
    to: recipientEmail,
    cc: parseCcEmails(profile?.ccEmails ?? null),
    subject: `Invoice ${number} from ${profile?.name ?? "CTK"}`,
    html: renderEmailLayout({
      heading: "Invoice",
      bodyHtml: `<p style="margin:0 0 8px">Please find invoice ${number} attached${invoice.dueDate ? ` — due ${invoice.dueDate.toLocaleDateString()}` : ""}.</p><p style="margin:0">Amount due: $${amountDue.toFixed(2)}</p>`,
      preheader: `Invoice ${number} — $${amountDue.toFixed(2)} due`,
    }),
    attachments: [{ filename: `invoice-${number}.pdf`, content: pdfBytes }],
  });

  const updated = await prisma.invoice.update({ where: { id }, data: { lastSentAt: new Date() } });

  await recordAudit({
    entityType: "Invoice",
    entityId: id,
    action: "send_invoice_pdf",
    actorId: session.user.id,
    newValue: recipientEmail,
  });

  revalidatePath(`/invoices/${id}`);
  return updated;
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
