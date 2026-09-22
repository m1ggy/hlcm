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
