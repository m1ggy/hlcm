// Pure formatting helper, split out from src/lib/actions/invoices.ts —
// that file is "use server", and Next requires every export from a
// "use server" module to be an async server action, so a plain sync
// helper living there silently breaks client bundling (it gets dropped,
// and any client component importing it fails to resolve the import).
/** issueDate/dueDate/paidAt are calendar dates picked from a plain
 * `<input type="date">` (e.g. "2026-09-14"), stored as UTC midnight — a
 * bare `.toLocaleDateString()` reinterprets that instant in whatever
 * timezone the caller runs in, which prints the day before whenever that
 * timezone is behind UTC. Forcing the UTC calendar fields keeps the
 * printed date the one that was actually typed in, everywhere it's shown. */
function calendarDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatCalendarDate(date: Date): string {
  return calendarDate(date).toLocaleDateString();
}

/** Same UTC-normalization as formatCalendarDate, for the day-of-week a
 * live-in/day-rate line prints instead of a caregiver name. */
export function formatCalendarWeekday(date: Date): string {
  return calendarDate(date).toLocaleDateString(undefined, { weekday: "long" });
}

export function displayInvoiceNumber(invoice: {
  seq: number;
  stripeInvoiceNumber: string | null;
  invoiceNumber?: string | null;
}) {
  return invoice.stripeInvoiceNumber ?? invoice.invoiceNumber ?? `DRAFT-${String(invoice.seq).padStart(5, "0")}`;
}

/** "R-000123" for a Receipt's local seq counter — same padded-counter
 * convention as displayInvoiceNumber's DRAFT-##### fallback, just always
 * this shape since a Receipt has no Stripe/manually-typed number to prefer. */
export function displayReceiptNumber(receipt: { seq: number }) {
  return `R-${String(receipt.seq).padStart(6, "0")}`;
}

/** Only SENT/PARTIALLY_PAID invoices actually have money still owed — a
 * Draft was never billed, and Paid/Void (including one voided via
 * voidInvoiceWithPayments, which resets amountPaid to 0 but not total)
 * never owe anything regardless of what total minus amountPaid would
 * otherwise compute to. Shared by InvoicesTable, CareRecipientsCard, and
 * the New invoice menu's recipient picker — all three used to redefine
 * this identically. */
export function outstandingBalance(invoice: { status: string; total: number | null; amountPaid: number | null }): number {
  if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") return 0;
  return Math.max(0, (invoice.total ?? 0) - (invoice.amountPaid ?? 0));
}
