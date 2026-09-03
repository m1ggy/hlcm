"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { saveBuffer, readStoredFile } from "@/lib/storage";
import { getInvoiceProfile, getDefaultInvoiceProfile, getInvoiceLogo, parseCcEmails } from "@/lib/invoice-profiles";
import { displayInvoiceNumber, displayReceiptNumber } from "@/lib/invoice-format";
import {
  createCustomer,
  createDraftInvoice,
  createInvoiceItem,
  finalizeInvoice,
  sendInvoice as sendInvoiceRemote,
  voidInvoiceRemote,
  payInvoiceOutOfBand,
  retrieveInvoice,
  listInvoiceLines,
  retrieveCustomer,
  findCustomersByEmail,
  listCustomerInvoices,
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
      clientGroupId: true,
      clientGroup: { select: { id: true, name: true } },
      projects: { select: { id: true, name: true } },
    },
  },
  application: { select: { id: true, name: true } },
  invoiceProfile: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payments: {
    include: { receipt: true, recordedBy: { select: { id: true, name: true } } },
    orderBy: { paidAt: "asc" as const },
  },
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

// A receipt's own PDF is generated once, at payment time, and its bytes
// never change afterward (see addManualPayment) — so unlike getInvoice's
// PDF, which is regenerated live from the invoice's current state every
// time, the download route for this just streams the stored file back.
export async function getReceipt(id: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.receipt.findUniqueOrThrow({
    where: { id },
    include: { payment: true, invoice: { include: invoiceInclude } },
  });
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
  // An imported row is deletable regardless of status — it's just a local
  // mirror of an invoice that already fully exists in Stripe (see
  // importStripeInvoice below), so removing it never touches Stripe itself
  // and just clears the way to re-import if the wrong one got picked.
  if (invoice.status !== "DRAFT" && !invoice.importedAt) {
    throw new Error("Only draft invoices can be deleted");
  }

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

const updateManualInvoiceDraftSchema = z.object({
  notes: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

// A manual invoice is created straight to "awaiting payment" — there's no
// Draft state to hide it behind while it's being put together. Line items,
// notes, and dates stay editable right through SENT and PARTIALLY_PAID —
// including after the client's already been emailed a copy (lastSentAt
// set) — so a mistake spotted after the fact doesn't have to become a
// voided invoice and a new one. Once PAID or VOID, it locks: money's been
// fully reconciled against the numbers as they stood, and changing them
// now would make that record wrong. Editing after lastSentAt is already
// set stamps editedAfterSendAt, which drives the "edited after sending"
// indicator on the invoice list/detail pages — see sendManualInvoicePdf,
// which clears it again once a fresh copy actually goes out.
export async function updateManualInvoiceDraft(id: string, input: z.infer<typeof updateManualInvoiceDraftSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = updateManualInvoiceDraftSchema.parse(input);

  const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (!isManual(before)) throw new Error("This invoice isn't a manually-recorded one");
  if (before.status !== "SENT" && before.status !== "PARTIALLY_PAID") {
    throw new Error("This invoice can no longer be edited — it's already been paid in full or voided");
  }

  const total = subtotalOf(parsed.lineItems);
  if (total < (before.amountPaid ?? 0)) {
    throw new Error(
      `The new total ($${total.toFixed(2)}) can't be less than the $${(before.amountPaid ?? 0).toFixed(2)} already recorded as paid`
    );
  }

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        notes: parsed.notes,
        issueDate: parsed.issueDate ? new Date(parsed.issueDate) : undefined,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        total,
        editedAfterSendAt: before.lastSentAt ? new Date() : undefined,
        lineItems: {
          create: parsed.lineItems.map((li, index) => ({ ...li, sortOrder: index })),
        },
      },
      include: invoiceInclude,
    });
  });

  await recordAudit({ entityType: "Invoice", entityId: id, action: "update_manual_draft", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return invoice;
}

const additionalPaymentInputSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidAt: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

// Records a payment against a manual invoice — the first one (bringing it
// off SENT) or another installment on top of an existing PARTIALLY_PAID
// balance; same action either way, and each gets its own itemized Payment
// row (amountPaid/paidAt/paymentMethod on Invoice stay too, as the
// "current cumulative" summary shown elsewhere). A Receipt PDF is
// generated and stored for every payment — not just the one that finally
// reaches PAID — synchronously, before this returns, so "a receipt exists"
// is a guarantee, not a best-effort background job. It is never emailed
// automatically; that's the separate, explicit sendReceiptEmail below.
// Refuses anything that isn't itself a manual invoice awaiting payment — a
// real Stripe-bound invoice's paid state comes from the webhook, not this.
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
  const paidAt = new Date(parsed.paidAt);

  const { invoice, payment, receipt } = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.update({
      where: { id },
      data: { amountPaid, paidAt, paymentMethod: parsed.paymentMethod, status: newStatus },
      include: invoiceInclude,
    });
    const payment = await tx.payment.create({
      data: { invoiceId: id, amount: parsed.amount, paidAt, paymentMethod: parsed.paymentMethod, recordedById: session.user.id },
    });
    // storageKey is filled in right after, once the PDF's been generated
    // and uploaded (slow I/O that shouldn't hold this transaction open) —
    // created here so its receipt number (seq) is assigned atomically
    // alongside the payment, with the PDF itself able to print that number.
    const receipt = await tx.receipt.create({ data: { paymentId: payment.id, invoiceId: id, storageKey: "" } });
    return { invoice, payment, receipt };
  });

  await recordAudit({
    entityType: "Invoice",
    entityId: id,
    action: "record_manual_payment",
    actorId: session.user.id,
    newValue: `${parsed.paymentMethod} (+$${parsed.amount.toFixed(2)})`,
  });

  // The payment itself is already committed above — a failure past this
  // point (a PDF render bug, GCS being briefly unreachable) must not make
  // this action throw and read as "payment recording failed" when it
  // didn't. storageKey stays "" if this fails, which the invoice detail
  // page reads as "receipt failed to generate" rather than a real one.
  try {
    const profile = await getInvoiceProfile(invoice.invoiceProfileId);
    const logo = await getInvoiceLogo(profile);
    const pdfBytes = await generateReceiptPdf({
      seq: receipt.seq,
      payment,
      invoice,
      client: invoice.client,
      logo,
      footerText: profile?.footerText ?? null,
      profileName: profile?.name ?? null,
    });
    const { storageKey } = await saveBuffer(Buffer.from(pdfBytes), ".pdf");
    await prisma.receipt.update({ where: { id: receipt.id }, data: { storageKey } });
  } catch (error) {
    console.error(`Failed to generate/store receipt for payment ${payment.id}:`, error);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return invoice;
}

const sendReceiptEmailInputSchema = z.string().min(1);

// The only place a receipt email ever goes out — generation (addManualPayment
// above) and sending are deliberately separate steps, so staff choose
// per-receipt whether the client gets a copy. Safe to call more than once
// (a "Resend" is just another send); sentAt/sentTo just track the most
// recent one.
export async function sendReceiptEmail(receiptId: string) {
  const session = await requireRole(MANAGE_ROLES);
  const id = sendReceiptEmailInputSchema.parse(receiptId);

  const receipt = await prisma.receipt.findUniqueOrThrow({
    where: { id },
    include: { payment: true, invoice: { include: invoiceInclude } },
  });
  const { invoice, payment } = receipt;
  // storageKey stays "" if the PDF failed to generate/upload when the
  // payment was recorded (see addManualPayment) — nothing to send yet.
  if (!receipt.storageKey) throw new Error("This receipt's PDF failed to generate — try recording the payment again");

  const recipientEmail = invoice.client.businessEmail ?? invoice.client.ownerEmail;
  if (!recipientEmail) throw new Error("Client has no email on file — add one before sending");

  const number = displayInvoiceNumber(invoice);
  const receiptNumber = displayReceiptNumber(receipt);
  const pdfBytes = await readStoredFile(receipt.storageKey);

  await sendEmail({
    to: recipientEmail,
    subject: `Receipt ${receiptNumber} — payment for Invoice ${number}`,
    html: renderEmailLayout({
      heading: "Payment received",
      bodyHtml: `<p style="margin:0 0 8px">Thank you for your payment of $${payment.amount.toFixed(2)} on invoice ${number}.</p><p style="margin:0">A copy of your receipt is attached for your records.</p>`,
      preheader: `Receipt for your payment on invoice ${number}`,
    }),
    attachments: [{ filename: `receipt-${receiptNumber}.pdf`, content: pdfBytes }],
  });

  await prisma.receipt.update({ where: { id }, data: { sentAt: new Date(), sentTo: recipientEmail } });

  await recordAudit({
    entityType: "Receipt",
    entityId: id,
    action: "send_receipt",
    actorId: session.user.id,
    newValue: recipientEmail,
  });

  revalidatePath(`/invoices/${invoice.id}`);
}

// Extra files the sender can staple onto a single "Send invoice PDF"
// email — picked fresh each time in SendInvoicePdfDialog, not persisted
// on the invoice itself. Whitelisted by MIME type rather than extension
// (a renamed file can't slip past this); size cap matches the one
// files.ts already applies to uploaded documents, kept well under the
// server actions bodySizeLimit (see next.config).
const ALLOWED_ATTACHMENT_TYPES: Record<string, true> = {
  "application/pdf": true,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true, // .xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true, // .docx
};
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function readExtraAttachments(formData: FormData | undefined) {
  if (!formData) return [];
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const attachments: { filename: string; content: Uint8Array }[] = [];
  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_TYPES[file.type]) {
      throw new Error(`"${file.name}" isn't a supported attachment type — only PDF, XLSX, and DOCX are allowed`);
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" is too large — attachments are limited to 20MB`);
    }
    attachments.push({ filename: file.name, content: new Uint8Array(await file.arrayBuffer()) });
  }
  return attachments;
}

// A plain courtesy copy of the invoice PDF — separate from a receipt
// (see sendReceiptEmail below), and only while the invoice is still
// awaiting payment; once PAID, "Send receipt" from the Payments card is
// the one that goes out. Tracks lastSentAt so the invoice detail page can
// show when this was last used. `formData` is optional and, when present,
// may carry extra one-off attachments under the "attachments" field (see
// readExtraAttachments above) — nothing here persists them.
export async function sendManualInvoicePdf(id: string, formData?: FormData) {
  const session = await requireRole(MANAGE_ROLES);
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });

  if (!isManual(invoice)) throw new Error("This invoice isn't a manually-recorded one");
  if (invoice.status === "PAID" || invoice.status === "VOID") {
    throw new Error("This invoice is no longer awaiting payment");
  }

  const recipientEmail = invoice.client.businessEmail ?? invoice.client.ownerEmail;
  if (!recipientEmail) throw new Error("Client has no email on file — add one before sending");

  const extraAttachments = await readExtraAttachments(formData);

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
    attachments: [{ filename: `invoice-${number}.pdf`, content: pdfBytes }, ...extraAttachments],
  });

  const updated = await prisma.invoice.update({
    where: { id },
    data: { lastSentAt: new Date(), editedAfterSendAt: null },
  });

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

// --- Import (a Stripe invoice created outside this app) --------------------

const STRIPE_IMPORT_STATUS_MAP: Partial<Record<string, $Enums.InvoiceStatus>> = {
  draft: "DRAFT",
  open: "SENT",
  paid: "PAID",
  void: "VOID",
  // "uncollectible" has no equivalent here — surfaced as an error below
  // rather than silently guessed at.
};

/**
 * For when whoever's importing doesn't have the Stripe invoice ID or
 * hosted link — only knows which client/email it's for. Resolves to a
 * Stripe customer (the client's own stripeCustomerId if it has one,
 * otherwise an exact email match on Stripe's side) and lists that
 * customer's recent invoices so the right one can be picked by eye,
 * flagging any already imported so they're not offered twice.
 */
export async function findStripeInvoicesForClient(input: { clientId?: string; email?: string }) {
  await requireRole(MANAGE_ROLES);

  let customers: { id: string; name: string | null; email: string | null }[] = [];

  if (input.clientId) {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: input.clientId } });
    if (client.stripeCustomerId) customers = [await retrieveCustomer(client.stripeCustomerId)];
  }
  if (customers.length === 0 && input.email?.trim()) {
    customers = await findCustomersByEmail(input.email.trim());
  }
  if (customers.length === 0) {
    throw new Error("No matching Stripe customer found — try the client's exact billing email instead");
  }

  const perCustomer = await Promise.all(customers.map((c) => listCustomerInvoices(c.id)));
  const invoices = perCustomer.flatMap((list, i) =>
    list.map((inv) => ({ ...inv, customerName: customers[i].name, customerEmail: customers[i].email }))
  );
  if (invoices.length === 0) return [];

  const existingIds = new Set(
    (
      await prisma.invoice.findMany({
        where: { stripeInvoiceId: { in: invoices.map((inv) => inv.id) } },
        select: { stripeInvoiceId: true },
      })
    ).map((inv) => inv.stripeInvoiceId)
  );

  return invoices
    .sort((a, b) => b.created - a.created)
    .map((inv) => ({
      stripeInvoiceId: inv.id,
      number: inv.number,
      status: inv.status,
      total: inv.total / 100,
      createdAt: new Date(inv.created * 1000),
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      alreadyImported: existingIds.has(inv.id),
    }));
}

/**
 * Fetches a Stripe invoice's current state (and its customer) without
 * writing anything — the first step of importStripeInvoice below, so an
 * admin can confirm they've got the right invoice/client pairing before
 * committing it. Also flags whether an existing Client already looks like
 * a match (same stripeCustomerId), to prefill the picker.
 */
export async function previewStripeInvoice(rawStripeInvoiceId: string) {
  await requireRole(MANAGE_ROLES);
  const stripeInvoiceId = rawStripeInvoiceId.trim();
  if (!stripeInvoiceId) throw new Error("Enter a Stripe invoice ID");

  const existing = await prisma.invoice.findUnique({ where: { stripeInvoiceId } });
  if (existing) throw new Error("This Stripe invoice has already been imported");

  const [invoice, lines] = await Promise.all([retrieveInvoice(stripeInvoiceId), listInvoiceLines(stripeInvoiceId)]);
  if (!STRIPE_IMPORT_STATUS_MAP[invoice.status]) {
    throw new Error(`Stripe invoice status "${invoice.status}" isn't supported for import`);
  }
  if (lines.length === 0) throw new Error("This Stripe invoice has no line items to import");

  const [customer, suggestedClient] = await Promise.all([
    retrieveCustomer(invoice.customer),
    prisma.client.findFirst({ where: { stripeCustomerId: invoice.customer }, select: { id: true, name: true } }),
  ]);

  return {
    stripeInvoiceId: invoice.id,
    status: invoice.status,
    number: invoice.number,
    total: invoice.total / 100,
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    createdAt: new Date(invoice.created * 1000),
    lineItemCount: lines.length,
    customerId: invoice.customer,
    customerName: customer.name,
    customerEmail: customer.email,
    suggestedClientId: suggestedClient?.id ?? null,
    suggestedClientName: suggestedClient?.name ?? null,
  };
}

const importStripeInvoiceSchema = z.object({
  stripeInvoiceId: z.string().min(1),
  clientId: z.string().min(1),
  applicationId: z.string().optional(),
});

/**
 * Pulls in a Stripe invoice that a coworker created directly in the Stripe
 * Dashboard rather than through this app — it has no matching Invoice row,
 * so the webhook handler (src/app/api/webhooks/stripe/route.ts) has been
 * silently ignoring every event for it. This backfills that row from
 * Stripe's current state; once stripeInvoiceId is set here, future webhook
 * events for the same Stripe invoice (paid, voided, ...) start applying
 * normally, same as one created the regular way.
 */
export async function importStripeInvoice(input: z.infer<typeof importStripeInvoiceSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = importStripeInvoiceSchema.parse(input);

  const existing = await prisma.invoice.findUnique({ where: { stripeInvoiceId: parsed.stripeInvoiceId } });
  if (existing) throw new Error("This Stripe invoice has already been imported");

  const [invoice, lines, client] = await Promise.all([
    retrieveInvoice(parsed.stripeInvoiceId),
    listInvoiceLines(parsed.stripeInvoiceId),
    prisma.client.findUniqueOrThrow({ where: { id: parsed.clientId } }),
  ]);

  const status = STRIPE_IMPORT_STATUS_MAP[invoice.status];
  if (!status) throw new Error(`Stripe invoice status "${invoice.status}" isn't supported for import`);
  if (lines.length === 0) throw new Error("This Stripe invoice has no line items to import");

  // A client already linked to a *different* Stripe customer is refused
  // outright rather than silently overwritten — that link is what every
  // future "New Online Invoice" for this client bills against.
  if (client.stripeCustomerId && client.stripeCustomerId !== invoice.customer) {
    throw new Error(
      `${client.name} is already linked to a different Stripe customer — pick the client that matches this invoice's Stripe customer (${invoice.customer}), or clear that client's existing link first.`
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (!client.stripeCustomerId) {
      await tx.client.update({ where: { id: client.id }, data: { stripeCustomerId: invoice.customer } });
    }
    return tx.invoice.create({
      data: {
        clientId: client.id,
        applicationId: parsed.applicationId || undefined,
        status,
        issueDate: new Date(invoice.created * 1000),
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
        total: invoice.total / 100,
        taxAmount: (invoice.tax ?? 0) / 100,
        stripeInvoiceId: invoice.id,
        stripeInvoiceNumber: invoice.number,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdfUrl: invoice.invoice_pdf,
        sentAt: status !== "DRAFT" ? new Date(invoice.created * 1000) : undefined,
        paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : undefined,
        importedAt: new Date(),
        createdById: session.user.id,
        lineItems: {
          create: lines.map((li, index) => {
            const quantity = li.quantity ?? 1;
            return {
              description: li.description || "Invoice item",
              quantity,
              unitPrice: li.amount / 100 / quantity,
              sortOrder: index,
            };
          }),
        },
      },
      include: invoiceInclude,
    });
  });

  await recordAudit({
    entityType: "Invoice",
    entityId: created.id,
    action: "import_stripe",
    actorId: session.user.id,
    newValue: invoice.id,
  });

  revalidatePath("/invoices");
  return created;
}
