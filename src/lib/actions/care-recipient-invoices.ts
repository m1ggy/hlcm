"use server";

// Billing a Care Recipient for their care — deliberately separate from
// createManualInvoice (src/lib/actions/invoices.ts), which is now purely
// the licensing-Client manual invoice flow. Both still create the same
// underlying Invoice row (Payments, Receipts, Attachments, Stripe fields,
// and email-sending all stay shared — see src/lib/invoice-shared.ts for
// the pure bits both files import), but this action always requires a
// careRecipientId and knows how to turn billed visits / a day-rate range
// into the structured VISIT_HOURLY / VISIT_DAILY line items
// generateCareRecipientInvoicePdf (src/lib/care-recipient-invoice-pdf.ts)
// renders as a real table instead of a typed description.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { getDefaultInvoiceProfile } from "@/lib/invoice-profiles";
import { MANAGE_ROLES, invoiceInclude, lineItemSchema, subtotalOf, friendlyInvoiceNumberError } from "@/lib/invoice-shared";

const recipientLineItemSchema = lineItemSchema.extend({
  // Defaults to MANUAL so a plain typed extra charge (e.g. a supply fee)
  // needs nothing beyond description/quantity/unitPrice, same as today.
  kind: z.enum(["MANUAL", "VISIT_HOURLY", "VISIT_DAILY"]).default("MANUAL"),
  visitDate: z.string().optional(),
  visitStart: z.string().optional(),
  visitEnd: z.string().optional(),
  workerName: z.string().optional(),
});

const createCareRecipientInvoiceSchema = z.object({
  clientId: z.string().min(1),
  careRecipientId: z.string().min(1),
  invoiceProfileId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  internalTag: z.string().optional(),
  lineItems: z.array(recipientLineItemSchema).min(1, "At least one visit, day, or line item is required"),
  // The logged visits being billed, if any — validated below, then marked
  // billed in the same transaction as the invoice itself. Not every
  // VISIT_HOURLY line item necessarily comes from a TimeEntry (a missed
  // visit can still be typed in as a plain hourly line), so this is a
  // separate list rather than derived from lineItems.
  timeEntryIds: z.array(z.string()).optional(),
});

// The Care Recipient counterpart to createManualInvoice — same "no draft,
// no Send, no card payment page" shape (always created unpaid, status
// SENT), just always tagged to a recipient and built from visits/day-rate
// ranges instead of free-typed lines. See CreateRecipientInvoiceDialog.
export async function createCareRecipientInvoice(input: z.infer<typeof createCareRecipientInvoiceSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = createCareRecipientInvoiceSchema.parse(input);
  const total = subtotalOf(parsed.lineItems);

  // A recipient must belong to the Client actually being billed — catches
  // a stale/mismatched pair rather than silently tagging the wrong
  // recipient (Invoice always bills through the recipient's own Client,
  // never independently — see CareRecipient's comment in
  // prisma/schema.prisma).
  const recipient = await prisma.careRecipient.findUniqueOrThrow({ where: { id: parsed.careRecipientId } });
  if (recipient.clientId !== parsed.clientId) {
    throw new Error("That care recipient doesn't belong to this client");
  }

  // Visits being billed must actually belong to this recipient and still
  // be unbilled — race-safety against double-billing the same visit (e.g.
  // two staff opening the same recipient's invoice dialog at once), not
  // just a client-side check.
  if (parsed.timeEntryIds?.length) {
    const billableCount = await prisma.timeEntry.count({
      where: { id: { in: parsed.timeEntryIds }, careRecipientId: parsed.careRecipientId, billedInvoiceId: null },
    });
    if (billableCount !== parsed.timeEntryIds.length) {
      throw new Error("One or more of those visits is no longer available to bill — someone else may have just billed it");
    }
  }

  // Resolved server-side rather than left null — every Care Recipient
  // invoice should have a definite billing identity, even if the dialog
  // somehow submitted without picking one.
  const profileId = parsed.invoiceProfileId || (await getDefaultInvoiceProfile())?.id;

  const invoice = await prisma
    .$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          clientId: parsed.clientId,
          careRecipientId: parsed.careRecipientId,
          invoiceProfileId: profileId,
          invoiceNumber: parsed.invoiceNumber || undefined,
          issueDate: parsed.issueDate ? new Date(parsed.issueDate) : undefined,
          dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
          notes: parsed.notes,
          internalTag: parsed.internalTag,
          status: "SENT",
          total,
          taxAmount: 0,
          createdById: session.user.id,
          lineItems: {
            create: parsed.lineItems.map((li, index) => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              sortOrder: index,
              kind: li.kind,
              visitDate: li.visitDate ? new Date(li.visitDate) : undefined,
              visitStart: li.visitStart ? new Date(li.visitStart) : undefined,
              visitEnd: li.visitEnd ? new Date(li.visitEnd) : undefined,
              workerName: li.workerName || undefined,
            })),
          },
        },
        include: invoiceInclude,
      });

      if (parsed.timeEntryIds?.length) {
        await tx.timeEntry.updateMany({
          where: { id: { in: parsed.timeEntryIds } },
          data: { billedInvoiceId: created.id },
        });
      }

      return created;
    })
    .catch(friendlyInvoiceNumberError);

  await recordAudit({ entityType: "Invoice", entityId: invoice.id, action: "create_care_recipient_invoice", actorId: session.user.id });

  revalidatePath("/invoices");
  revalidatePath("/clients");
  return invoice;
}

// Sum of (total - amountPaid) across every non-VOID invoice billed to this
// recipient, this one included — the "Outstanding Account Balance (All
// Invoices)" / "Total Amount Due" figures on
// generateCareRecipientInvoicePdf's Totals block. A DB query, so it's
// computed here by the caller (the PDF download route / sendManualInvoicePdf)
// rather than inside that otherwise-pure renderer.
export async function computeOutstandingAccountBalance(careRecipientId: string): Promise<number> {
  await requireRole(MANAGE_ROLES);
  const invoices = await prisma.invoice.findMany({
    where: { careRecipientId, status: { not: "VOID" } },
    select: { total: true, amountPaid: true },
  });
  return invoices.reduce((sum, inv) => sum + (inv.total ?? 0) - (inv.amountPaid ?? 0), 0);
}
