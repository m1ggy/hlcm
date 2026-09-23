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
import {
  MANAGE_ROLES,
  invoiceInclude,
  structuredLineItemSchema,
  toStructuredLineItemData,
  subtotalOf,
  friendlyInvoiceNumberError,
} from "@/lib/invoice-shared";

const createCareRecipientInvoiceSchema = z.object({
  clientId: z.string().min(1),
  careRecipientId: z.string().min(1),
  invoiceProfileId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  // The billing period printed on the PDF — always staff-typed, never
  // derived from the picked visits/day-rate range (see Invoice.periodStart
  // in prisma/schema.prisma for why).
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().optional(),
  internalTag: z.string().optional(),
  lineItems: z.array(structuredLineItemSchema).min(1, "At least one visit, day, or line item is required"),
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
// z.input, not z.infer (== z.output) — see updateManualInvoiceDraft's own
// comment on this in src/lib/actions/invoices.ts.
export async function createCareRecipientInvoice(input: z.input<typeof createCareRecipientInvoiceSchema>) {
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
          periodStart: parsed.periodStart ? new Date(parsed.periodStart) : undefined,
          periodEnd: parsed.periodEnd ? new Date(parsed.periodEnd) : undefined,
          notes: parsed.notes,
          internalTag: parsed.internalTag,
          status: "SENT",
          total,
          taxAmount: 0,
          createdById: session.user.id,
          lineItems: {
            create: parsed.lineItems.map((li, index) => toStructuredLineItemData(li, index)),
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

const createBatchCareRecipientInvoicesSchema = z.object({
  clientId: z.string().min(1),
  recipientIds: z.array(z.string()).min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  invoiceProfileId: z.string().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
});

function hoursOf(entry: { clockIn: Date; clockOut: Date | null }) {
  return ((entry.clockOut ?? entry.clockIn).getTime() - entry.clockIn.getTime()) / (1000 * 60 * 60);
}

export type BatchInvoiceResult =
  | { recipientId: string; recipientName: string; status: "created"; invoiceId: string }
  | { recipientId: string; recipientName: string; status: "skipped" }
  | { recipientId: string; recipientName: string; status: "failed"; error: string };

// "This week's Ace invoices" — bills every picked recipient under one
// Client from their logged unbilled visits in [from, to], one
// createCareRecipientInvoice call per recipient rather than duplicating
// its validation/transaction/audit logic. Each recipient succeeds or
// fails independently (a stale preview — someone else billed that visit
// in the gap before this ran — only skips that one recipient, it doesn't
// abort the batch) — see BatchCareRecipientInvoiceDialog, which shows
// the returned per-recipient results.
export async function createBatchCareRecipientInvoices(
  input: z.infer<typeof createBatchCareRecipientInvoicesSchema>
): Promise<BatchInvoiceResult[]> {
  await requireRole(MANAGE_ROLES);
  const parsed = createBatchCareRecipientInvoicesSchema.parse(input);
  const from = new Date(`${parsed.from}T00:00:00`);
  const to = new Date(`${parsed.to}T23:59:59.999`);

  const results: BatchInvoiceResult[] = [];
  for (const recipientId of parsed.recipientIds) {
    const recipient = await prisma.careRecipient.findUnique({ where: { id: recipientId } });
    if (!recipient || recipient.clientId !== parsed.clientId) {
      results.push({ recipientId, recipientName: recipient?.name ?? recipientId, status: "failed", error: "Recipient no longer belongs to this client" });
      continue;
    }

    const visits = await prisma.timeEntry.findMany({
      where: { careRecipientId: recipientId, clockOut: { not: null }, billedInvoiceId: null, clockIn: { gte: from, lte: to } },
      include: { user: { select: { name: true } } },
      orderBy: { clockIn: "asc" },
    });
    if (visits.length === 0) {
      results.push({ recipientId, recipientName: recipient.name, status: "skipped" });
      continue;
    }

    try {
      const invoice = await createCareRecipientInvoice({
        clientId: parsed.clientId,
        careRecipientId: recipientId,
        invoiceProfileId: parsed.invoiceProfileId,
        issueDate: parsed.issueDate,
        dueDate: parsed.dueDate,
        timeEntryIds: visits.map((v) => v.id),
        lineItems: visits.map((v) => ({
          description: `${v.clockIn.toLocaleDateString()} visit — ${v.user.name} (${hoursOf(v).toFixed(2)}h)`,
          quantity: Number(hoursOf(v).toFixed(2)),
          unitPrice: recipient.hourlyRate ?? 0,
          kind: "VISIT_HOURLY" as const,
          visitDate: v.clockIn,
          visitStart: v.clockIn,
          visitEnd: v.clockOut ?? v.clockIn,
          workerName: v.user.name,
        })),
      });
      results.push({ recipientId, recipientName: recipient.name, status: "created", invoiceId: invoice.id });
    } catch (error) {
      results.push({ recipientId, recipientName: recipient.name, status: "failed", error: error instanceof Error ? error.message : "Failed to create invoice" });
    }
  }

  return results;
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
