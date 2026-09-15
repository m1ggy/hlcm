// Webhook-signature verification for Calendly bookings — same shape as
// src/lib/stripe.ts's verifyWebhookSignature (a lazy secret getter, a
// *ConfigError/*Error pair, hand-rolled HMAC per the provider's own docs,
// no SDK dependency). Server-only — never import from a client component.
//
// Calendly's scheme (https://developer.calendly.com/api-docs — Webhook
// Signatures) happens to look almost identical to Stripe's: header
// "t=<unix_ts>,v1=<hex hmac>", HMAC-SHA256 over "${t}.${rawBody}", keyed by
// a signing_key WE generate and supply when creating the subscription —
// confirmed against a real API call (2026-09-14) that Calendly does NOT
// generate and hand one back the way Stripe/DocuSign do; see
// scripts/create-calendly-webhook.ts's header comment for the full story.
// One addition Stripe's route doesn't bother with: Calendly's docs
// explicitly recommend rejecting an old timestamp to block replay, so this
// does too.

import crypto from "crypto";

export class CalendlyConfigError extends Error {}
export class CalendlyWebhookError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
export class CalendlyApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

function getSigningKey() {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) throw new CalendlyConfigError("CALENDLY_WEBHOOK_SIGNING_KEY env var is required");
  return key;
}

export type CalendlyWebhookEvent = {
  event: "invitee.created" | "invitee.canceled" | string;
  payload: Record<string, unknown>;
};

export function verifyCalendlyWebhookSignature(rawBody: string, signatureHeader: string | null): CalendlyWebhookEvent {
  if (!signatureHeader) throw new CalendlyWebhookError("Missing Calendly-Webhook-Signature header", 400);

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const [k, v] = pair.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) throw new CalendlyWebhookError("Malformed Calendly-Webhook-Signature header", 400);

  const age = Date.now() / 1000 - Number(timestamp);
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS || age < -MAX_SIGNATURE_AGE_SECONDS) {
    throw new CalendlyWebhookError("Signature timestamp too old", 400);
  }

  const computed = crypto
    .createHmac("sha256", getSigningKey())
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new CalendlyWebhookError("Signature verification failed", 400);
  }

  return JSON.parse(rawBody);
}

// Calendly doesn't put a phone number on the invitee resource by default —
// it only shows up if the event type has a custom question asking for one.
// Matches the first answer whose question text mentions "phone", falling
// back to text_reminder_number (populated when the event type has SMS
// reminders configured, a separate Calendly feature from custom questions).
export function extractPhoneAnswer(
  questionsAndAnswers: { question: string; answer: string }[] | undefined,
  textReminderNumber?: string | null
): string | null {
  const match = questionsAndAnswers?.find((qa) => qa.question.toLowerCase().includes("phone"));
  return match?.answer || textReminderNumber || null;
}

// --- Live API calls (single-use rebooking links, cancellation) ---
//
// Separate credential from the signing key above: CALENDLY_API_TOKEN is a
// Personal Access Token (dashboard -> Integrations -> API & Webhooks ->
// Generate New Token), the same kind of token scripts/create-calendly-
// webhook.ts uses one-off, but stored persistently here so the running app
// can call Calendly live (that script's CALENDLY_PAT is deliberately never
// stored). Calendly PATs aren't scope-limited — this has full account
// access, same as every other PAT this integration has used. Same wrapper
// shape as src/lib/docusign.ts/src/lib/stripe.ts: lazy env getter, an
// isXConfigured() check, a *ApiError with a status code, plain fetch.

const API_BASE = "https://api.calendly.com";

function getApiToken(): string | null {
  return process.env.CALENDLY_API_TOKEN || null;
}

export function isCalendlyApiConfigured(): boolean {
  return getApiToken() !== null;
}

async function calendlyFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getApiToken();
  if (!token) throw new CalendlyConfigError("CALENDLY_API_TOKEN env var is required");
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new CalendlyApiError(`Calendly API request failed: ${res.status} ${await res.text()}`, res.status);
  return res;
}

// scheduledEventUri = Lead.calendlyEventUri, already a full API URI (e.g.
// https://api.calendly.com/scheduled_events/UUID — straight from the
// webhook payload's scheduled_event.uri). Looks up that event's own event
// type first, then asks for a single-use link to the SAME kind of meeting
// — a rebooking nudge shouldn't silently swap what's being booked. Request/
// response shape per Calendly's docs (GET /scheduled_events/{uuid} ->
// resource.event_type; POST /scheduling_links -> resource.booking_url) —
// not yet confirmed against a live call (needs CALENDLY_API_TOKEN set),
// same caveat as everything else this integration has had to verify live.
export async function createSingleUseSchedulingLink(scheduledEventUri: string): Promise<string> {
  const eventRes = await calendlyFetch(scheduledEventUri, { method: "GET" });
  const event = await eventRes.json();
  const eventTypeUri = event.resource.event_type as string;

  const linkRes = await calendlyFetch(`${API_BASE}/scheduling_links`, {
    method: "POST",
    body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: "EventType" }),
  });
  const link = await linkRes.json();
  return link.resource.booking_url as string;
}

// Cancels the real Calendly event (all invitees on it — fine here, these
// are 1:1 meetings) and sends Calendly's own cancellation email to the
// invitee. scheduledEventUri is Lead.calendlyEventUri, same as above.
export async function cancelScheduledEvent(scheduledEventUri: string, reason: string): Promise<void> {
  await calendlyFetch(`${scheduledEventUri}/cancellation`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
