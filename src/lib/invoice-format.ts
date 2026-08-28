// Pure formatting helper, split out from src/lib/actions/invoices.ts —
// that file is "use server", and Next requires every export from a
// "use server" module to be an async server action, so a plain sync
// helper living there silently breaks client bundling (it gets dropped,
// and any client component importing it fails to resolve the import).
export function displayInvoiceNumber(invoice: {
  seq: number;
  stripeInvoiceNumber: string | null;
  invoiceNumber?: string | null;
}) {
  return invoice.stripeInvoiceNumber ?? invoice.invoiceNumber ?? `DRAFT-${String(invoice.seq).padStart(5, "0")}`;
}
