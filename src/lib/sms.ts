import { db } from "@/lib/db";
import { sendSmsWith, TwilioApiError, type TwilioCreds } from "@/lib/twilio";

// Texts to staff from the one shared Carenela number (docs/forms-plan.md,
// decided F2) — not a workspace's own Twilio account (that one still sends
// meeting reminders, src/lib/meeting-reminders.ts). Configured on the server:
//   SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN, SMS_TWILIO_FROM (+1…)
// The number must be registered for business texting (A2P 10DLC or a
// verified toll-free number) or US carriers drop the messages.
//
// Every send is logged (SmsLog). A person who replied STOP gets Twilio
// error 21610 from then on: we mark them opted out and stop trying.

const OPTED_OUT = 21610;

export function platformSmsCreds(): TwilioCreds | null {
  const accountSid = process.env.SMS_TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.SMS_TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.SMS_TWILIO_FROM?.trim();
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
}

export function isPlatformSmsConfigured() {
  return platformSmsCreds() !== null;
}

/** Keeps a text to one segment where possible (160 plain characters). */
export function fitSms(text: string, max = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export type StaffTextResult = { userId: string; ok: boolean; error?: string };

/**
 * Texts a staff member. Skips quietly (logged) when texting isn't set up,
 * they have no phone, or they've opted out. Never throws.
 */
export async function textStaff(
  user: { id: string; phone: string | null; smsOptedOutAt: Date | null },
  body: string,
  meta: { purpose: string; entityId?: string }
): Promise<StaffTextResult> {
  const log = (ok: boolean, extra: { twilioSid?: string; error?: string }) =>
    db.smsLog.create({ data: { userId: user.id, toNumber: user.phone ?? "", purpose: meta.purpose, entityId: meta.entityId, ok, ...extra } });

  const creds = platformSmsCreds();
  if (!creds) {
    await log(false, { error: "Texting isn't set up on this server" });
    return { userId: user.id, ok: false, error: "not configured" };
  }
  if (!user.phone) return { userId: user.id, ok: false, error: "no phone" };
  if (user.smsOptedOutAt) return { userId: user.id, ok: false, error: "opted out" };
  try {
    const sid = await sendSmsWith(creds, user.phone, body);
    await log(true, { twilioSid: sid });
    return { userId: user.id, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log(false, { error: message.slice(0, 500) });
    if (error instanceof TwilioApiError && error.code === OPTED_OUT) {
      await db.user.update({ where: { id: user.id }, data: { smsOptedOutAt: new Date() } });
    }
    return { userId: user.id, ok: false, error: message };
  }
}
