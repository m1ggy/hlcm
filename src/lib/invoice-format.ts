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

/** "Jan 01, 2024" — the compact form the client/service screens use
 * (same UTC normalization as formatCalendarDate). */
export function formatShortCalendarDate(date: Date): string {
  return calendarDate(date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
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

export type LineBalance = { amount: number; paid: number; due: number };

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What's been paid and what's still owed on each line of a running invoice
 * (one invoice that keeps growing — a new line each month — with payments
 * coming in along the way). A payment recorded against a line counts there
 * first, up to that line's amount; everything else paid on the invoice
 * (payments for the invoice as a whole, any overpayment of a line, or an
 * older amountPaid with no Payment rows behind it) fills the lines in
 * order, oldest first.
 */
export function lineBalances(
  lineItems: { id?: string; quantity: number; unitPrice: number }[],
  amountPaid: number | null,
  payments: { amount: number; lineItemId: string | null }[] = []
): LineBalance[] {
  const amounts = lineItems.map((li) => cents(li.quantity * li.unitPrice));
  const paid = amounts.map(() => 0);
  let pool = amountPaid ?? 0;
  lineItems.forEach((li, i) => {
    if (!li.id) return;
    const linked = payments.filter((p) => p.lineItemId === li.id).reduce((sum, p) => sum + p.amount, 0);
    const applied = Math.max(0, Math.min(linked, amounts[i]));
    paid[i] = applied;
    pool -= applied;
  });
  pool = Math.max(0, pool);
  amounts.forEach((amount, i) => {
    const take = Math.min(pool, Math.max(0, amount - paid[i]));
    paid[i] += take;
    pool -= take;
  });
  return amounts.map((amount, i) => ({ amount, paid: cents(paid[i]), due: cents(amount - paid[i]) }));
}

/**
 * Who an invoice is addressed to at the client: their first contact, else
 * their first owner. The email falls back to the business email. Printed
 * under Bill To on the PDF, and the default "Paid by" for a new payment.
 */
export function invoiceContact(client: {
  businessEmail?: string | null;
  contacts?: { name: string; email: string | null }[];
  owners?: { name: string; email?: string | null }[];
}): { name: string; email: string | null } | null {
  const person = client.contacts?.[0] ?? client.owners?.[0];
  if (!person) return client.businessEmail ? { name: "", email: client.businessEmail } : null;
  return { name: person.name, email: person.email || client.businessEmail || null };
}
