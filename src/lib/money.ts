// Every money amount the app shows — screens, PDFs, emails, exports, audit
// entries — is formatted here, and Stripe invoices use the same currency.
// Workspaces are US-only for now (USD); supporting another currency starts
// with this file. No imports, so client components can use it.

export const CURRENCY = "USD";
/** Stripe's lowercase spelling of CURRENCY. */
export const STRIPE_CURRENCY = "usd";

const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY });

/** "$1,234.50", "-$50.00". */
export function formatMoney(amount: number) {
  return formatter.format(amount);
}
