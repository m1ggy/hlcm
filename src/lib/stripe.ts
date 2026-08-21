// Thin wrapper around Stripe's HTTP API — same shape as src/lib/wise.ts and
// src/lib/email.ts (no SDK dependency, a lazy secret getter, a
// *ConfigError/*ApiError pair). Server-only — never import from a client
// component, the secret key would end up in the bundle.
//
// We use Stripe's native Invoicing API (not a hand-rolled Checkout Session)
// per Stripe's own implementation guidance for B2B one-time invoicing:
// create a draft Invoice + Invoice Items, finalize (Stripe Tax computes the
// real tax at this point), then let Stripe email the client its own hosted
// invoice page + PDF.
//
// Docs: https://docs.stripe.com/invoicing/integration
//       https://docs.stripe.com/tax/invoicing
//       https://docs.stripe.com/webhooks#verify-manually

import crypto from "crypto";

const API_BASE = "https://api.stripe.com/v1";

export class StripeConfigError extends Error {}
export class StripeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

function getSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeConfigError("STRIPE_SECRET_KEY env var is required");
  return key;
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new StripeConfigError("STRIPE_WEBHOOK_SECRET env var is required");
  return secret;
}

async function stripeFetch<T>(path: string, method: "GET" | "POST", params?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? new URLSearchParams(params ?? {}) : undefined,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.error?.message ?? `Stripe API returned ${res.status}`;
    throw new StripeApiError(message, res.status, body);
  }
  return body as T;
}

// Stripe's form-encoded API needs nested objects/arrays flattened into
// bracket-notation keys (`address[state]=IL`) rather than a JSON body.
function flatten(value: unknown, prefix: string, out: Record<string, string>) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}[${key}]` : key, out);
    }
  } else {
    out[prefix] = String(value);
  }
}

function toParams(obj: Record<string, unknown>) {
  const flat: Record<string, string> = {};
  flatten(obj, "", flat);
  return flat;
}

type StripeCustomer = { id: string };

export async function createCustomer(params: {
  email: string;
  name: string;
  address?: { line1?: string; city?: string; state?: string; postal_code?: string; country?: string };
  metadata?: Record<string, string>;
}): Promise<StripeCustomer> {
  return stripeFetch<StripeCustomer>("customers", "POST", toParams(params));
}

type StripeInvoice = {
  id: string;
  status: string;
  number: string | null;
  total: number;
  tax: number | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

// Draft only — line items are added after via createInvoiceItem, then the
// invoice is finalized (see finalizeInvoice) once all items are attached.
export async function createDraftInvoice(params: {
  customerId: string;
  daysUntilDue: number;
  invoiceId: string;
}): Promise<StripeInvoice> {
  return stripeFetch<StripeInvoice>(
    "invoices",
    "POST",
    toParams({
      customer: params.customerId,
      collection_method: "send_invoice",
      days_until_due: params.daysUntilDue,
      auto_advance: false,
      automatic_tax: { enabled: true },
      metadata: { invoiceId: params.invoiceId },
    })
  );
}

// One line per InvoiceLineItem — `amount` is the item's already-multiplied
// total (quantity * unitPrice) in cents, so the human-readable "3 hrs @
// $150" detail lives in the description rather than needing a Stripe
// Product per line. tax_code is intentionally left unset: Stripe Tax falls
// back to the account's default product tax code (Settings > Tax), which
// the merchant configures once in the Dashboard.
export async function createInvoiceItem(params: {
  customerId: string;
  stripeInvoiceId: string;
  description: string;
  amountCents: number;
}) {
  return stripeFetch(
    "invoiceitems",
    "POST",
    toParams({
      customer: params.customerId,
      invoice: params.stripeInvoiceId,
      amount: params.amountCents,
      currency: "usd",
      description: params.description,
      tax_behavior: "exclusive",
    })
  );
}

export async function finalizeInvoice(stripeInvoiceId: string): Promise<StripeInvoice> {
  return stripeFetch<StripeInvoice>(`invoices/${stripeInvoiceId}/finalize`, "POST");
}

// Triggers Stripe's own branded email to the customer with the hosted
// invoice page + PDF link — we don't send our own email for this.
export async function sendInvoice(stripeInvoiceId: string): Promise<StripeInvoice> {
  return stripeFetch<StripeInvoice>(`invoices/${stripeInvoiceId}/send`, "POST");
}

export async function voidInvoiceRemote(stripeInvoiceId: string): Promise<StripeInvoice> {
  return stripeFetch<StripeInvoice>(`invoices/${stripeInvoiceId}/void`, "POST");
}

// For payments collected outside Stripe (check/cash) — keeps Stripe as the
// source of truth even for a manual "Mark Paid" so its own reporting stays
// correct, rather than only updating our own DB.
export async function payInvoiceOutOfBand(stripeInvoiceId: string): Promise<StripeInvoice> {
  return stripeFetch<StripeInvoice>(`invoices/${stripeInvoiceId}/pay`, "POST", { paid_out_of_band: "true" });
}

// Hand-rolled per Stripe's documented verification scheme — no SDK needed.
// Header looks like "t=1614556800,v1=<hex hmac>[,v0=...]".
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): { type: string; data: { object: Record<string, unknown> } } {
  if (!signatureHeader) throw new StripeApiError("Missing Stripe-Signature header", 400, null);

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const [k, v] = pair.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) throw new StripeApiError("Malformed Stripe-Signature header", 400, null);

  const computed = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new StripeApiError("Signature verification failed", 400, null);
  }

  return JSON.parse(rawBody);
}
