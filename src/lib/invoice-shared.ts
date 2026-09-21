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
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

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
