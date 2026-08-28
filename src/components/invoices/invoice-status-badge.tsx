import { Badge } from "@/components/ui/badge";

const STATUS_LABELS = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
} as const;

type InvoiceStatusValue = keyof typeof STATUS_LABELS;

// PAID gets the same emerald treatment as a COMPLETED task elsewhere in the
// app — everything else maps onto an existing Badge variant.
const STATUS_CLASSNAME: Record<InvoiceStatusValue, string | undefined> = {
  DRAFT: undefined,
  SENT: undefined,
  PAID: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  PARTIALLY_PAID: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  OVERDUE: undefined,
  VOID: undefined,
};

const STATUS_VARIANT: Record<InvoiceStatusValue, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  SENT: "default",
  PAID: "outline",
  PARTIALLY_PAID: "outline",
  OVERDUE: "destructive",
  VOID: "outline",
};

export function isInvoiceOverdue(invoice: { status: string; dueDate: Date | string | null }) {
  if (!invoice.dueDate || invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID" || invoice.status === "VOID")
    return false;
  const due = typeof invoice.dueDate === "string" ? new Date(invoice.dueDate) : invoice.dueDate;
  return due.getTime() < Date.now();
}

// A non-DRAFT invoice that never got a Stripe invoice — the only way that
// combination happens is createManualInvoice/addManualPayment (see
// src/lib/actions/invoices.ts): a Stripe-bound invoice only ever leaves
// DRAFT in the same step that sets stripeInvoiceId (see sendInvoice), and
// never clears it again afterward, so DRAFT is the only status a *real*
// Stripe invoice can have alongside a null stripeInvoiceId.
export function isManualInvoice(invoice: { status: string; stripeInvoiceId: string | null }) {
  return !invoice.stripeInvoiceId && invoice.status !== "DRAFT";
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const value = status as InvoiceStatusValue;
  return (
    <Badge variant={STATUS_VARIANT[value]} className={STATUS_CLASSNAME[value]}>
      {STATUS_LABELS[value] ?? status}
    </Badge>
  );
}

export { STATUS_LABELS as INVOICE_STATUS_LABELS };
export type { InvoiceStatusValue };
