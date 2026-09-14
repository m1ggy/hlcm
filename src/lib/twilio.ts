// Thin wrapper around Twilio's REST API (SMS + voice calls) — same shape as
// src/lib/stripe.ts/src/lib/wise.ts (lazy env getters, a *ConfigError/
// *ApiError pair, no SDK, plain fetch). Server-only — never import from a
// client component, the auth token would end up in the bundle.
//
// Docs: https://www.twilio.com/docs/messaging/api/message-resource
//       https://www.twilio.com/docs/voice/api/call-resource

const API_BASE = "https://api.twilio.com/2010-04-01";

export class TwilioConfigError extends Error {}
export class TwilioApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

function getCreds(): { accountSid: string; authToken: string; fromNumber: string } | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export function isTwilioConfigured(): boolean {
  return getCreds() !== null;
}

function requireCreds() {
  const creds = getCreds();
  if (!creds) throw new TwilioConfigError("TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER env vars are required");
  return creds;
}

async function twilioPost(accountSid: string, authToken: string, path: string, params: Record<string, string>) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(`${API_BASE}/Accounts/${accountSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new TwilioApiError(body?.message ?? `Twilio request failed: ${res.status}`, res.status);
  }
}

export async function sendSms(to: string, body: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = requireCreds();
  await twilioPost(accountSid, authToken, "Messages.json", { To: to, From: fromNumber, Body: body });
}

// No separate TwiML-hosting endpoint needed — Twilio accepts inline TwiML
// directly via the Twiml param on call creation, so this is a single
// request: Twilio dials `to`, and reads `sayMessage` aloud when answered.
export async function placeCall(to: string, sayMessage: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = requireCreds();
  const escaped = sayMessage.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const twiml = `<Response><Say>${escaped}</Say></Response>`;
  await twilioPost(accountSid, authToken, "Calls.json", { To: to, From: fromNumber, Twiml: twiml });
}
