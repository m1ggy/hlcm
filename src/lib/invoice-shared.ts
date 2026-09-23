// Pure helpers/constants shared between src/lib/actions/invoices.ts and
// src/lib/actions/care-recipient-invoices.ts — split out for the same
// reason as src/lib/invoice-format.ts: those two are "use server" files,
// and Next requires every export from a "use server" module to be an
// async server action, so a plain const/sync-function export living there
// silently breaks client bundling.
import { z } from "zod";
import type { AppRole } from "@/lib/rbac";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// Invoices are ACCOUNTANT-exclusive (plus OWNER, who bypasses every
// requireRole check) — plain ADMIN and MANAGER don't get this module. See
// canAccessInvoices() in src/lib/rbac.ts, which every invoice UI gate uses.
export const MANAGE_ROLES: AppRole[] = ["ACCOUNTANT"];

export const invoiceInclude = {
  client: {
    select: {
      id: true,
      name: true,
      businessName: true,
      businessEmail: true,
      owners: { select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 },
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
  // Which Care Recipient this bills for, if any — set only by
  // createCareRecipientInvoice. The extra fields (address/email/
  // billingContact*/dateOfBirth/socialSecurityNumber) are what
  // generateCareRecipientInvoicePdf's header and resolveRecipientEmail
  // read to address/email the invoice to the actual payer instead of the
  // agency, and to print the patient info block, when set.
  careRecipient: {
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      billingContactName: true,
      billingContactEmail: true,
      billingContactPhone: true,
      dateOfBirth: true,
      socialSecurityNumber: true,
    },
  },
  createdBy: { select: { id: true, name: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  payments: {
    include: { receipt: true, recordedBy: { select: { id: true, name: true } } },
    orderBy: { paidAt: "asc" as const },
  },
} as const;

export const lineItemSchema = z.object({
  description: z.string().min(1),
  // Not .int() — day-rate/prorated lines bill fractional hours (e.g. 8.5).
  quantity: z.coerce.number().min(0.01),
  unitPrice: z.coerce.number().min(0),
});

// A Care Recipient invoice's line item, structured beyond the plain
// description/qty/unit-price shape so generateCareRecipientInvoicePdf can
// render real Date/Worker/Times/Rate columns instead of parsing them back
// out of `description` — see the `kind`/visit* fields on InvoiceLineItem
// in prisma/schema.prisma. Shared between createCareRecipientInvoice
// (src/lib/actions/care-recipient-invoices.ts) and updateManualInvoiceDraft
// (src/lib/actions/invoices.ts, which every manual invoice's edit — Care
// Recipient or not — goes through): a plain manual invoice's editor never
// sends these fields, so they're simply absent there and every line
// defaults to MANUAL, same as always. Without this shared schema,
// updateManualInvoiceDraft's plain lineItemSchema would silently strip
// kind/visitDate/visitStart/visitEnd/workerName on every save (Zod drops
// unrecognized keys by default), permanently downgrading a Care Recipient
// invoice's structured hourly/day-rate lines to plain MANUAL ones the
// first time anyone edited it after creation.
export const structuredLineItemSchema = lineItemSchema.extend({
  // Defaults to MANUAL so a plain typed extra charge (e.g. a supply fee)
  // needs nothing beyond description/quantity/unitPrice, same as today.
  kind: z.enum(["MANUAL", "VISIT_HOURLY", "VISIT_DAILY"]).default("MANUAL"),
  // z.coerce.date(), not z.string() — createCareRecipientInvoice's own
  // caller always sends fresh ISO strings (from a date input or
  // .toISOString()), but updateManualInvoiceDraft's caller
  // (ManualInvoiceEditor) round-trips an *existing* invoice's line items
  // untouched when only quantity/price/description changed, and those
  // arrive as real Date objects straight from Prisma, not strings.
  visitDate: z.coerce.date().optional(),
  visitStart: z.coerce.date().optional(),
  visitEnd: z.coerce.date().optional(),
  workerName: z.string().optional(),
});

// The DB-ready shape structuredLineItemSchema's dates need — shared by both
// call sites' `lineItems: { create: [...] }` mapping.
export function toStructuredLineItemData(li: z.infer<typeof structuredLineItemSchema>, sortOrder: number) {
  return {
    description: li.description,
    quantity: li.quantity,
    unitPrice: li.unitPrice,
    sortOrder,
    kind: li.kind,
    visitDate: li.visitDate,
    visitStart: li.visitStart,
    visitEnd: li.visitEnd,
    workerName: li.workerName || undefined,
  };
}

// Pre-send estimate only (no tax) — the real total + tax come back from
// Stripe Tax once a Stripe-bound invoice is finalized; a manual/Care
// Recipient invoice never goes through Stripe, so this is the final total.
export function subtotalOf(lineItems: { quantity: number; unitPrice: number }[]) {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

// A duplicate typed invoiceNumber is the one way a manual/Care Recipient
// invoice insert can fail on a constraint rather than validation — see
// friendlyPrismaError in src/lib/prisma-errors.ts for the general pattern
// this follows.
export function friendlyInvoiceNumberError(error: unknown): never {
  return friendlyPrismaError(error, {
    duplicateMessages: {
      invoiceNumber:
        "That invoice number is already in use on another invoice — including voided ones from before this " +
        "was fixed, since voiding didn't used to free it up. Pick a different number, or leave it blank to " +
        "auto-assign one.",
    },
  });
}

// A PAID or PARTIALLY_PAID invoice that never got a Stripe invoice — see
// isManualInvoice in src/components/invoices/invoice-status-badge.tsx for
// the fuller version of this check (this one's inlined to avoid importing a
// client-only component module into a "use server" action file).
export function isManual(invoice: { status: string; stripeInvoiceId: string | null }) {
  return !invoice.stripeInvoiceId && invoice.status !== "DRAFT";
}
