// Webhook-signature verification for Calendly bookings — same shape as
// src/lib/stripe.ts's verifyWebhookSignature (a lazy secret getter, a
// *ConfigError/*Error pair, hand-rolled HMAC per the provider's own docs,
// no SDK dependency). Server-only — never import from a client component.
//
// Calendly's scheme (https://developer.calendly.com/api-docs — Webhook
// Signatures) happens to look almost identical to Stripe's: header
// "t=<unix_ts>,v1=<hex hmac>", HMAC-SHA256 over "${t}.${rawBody}", keyed by
// the webhook subscription's own signing_key (returned once, at
// subscription-creation time — see scripts/create-calendly-webhook.ts).
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
