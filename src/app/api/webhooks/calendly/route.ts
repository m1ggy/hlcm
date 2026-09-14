import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { verifyCalendlyWebhookSignature, extractPhoneAnswer, CalendlyWebhookError } from "@/lib/calendly";
import type { Lead } from "@/generated/prisma/client";

// Only the fields this route actually reads, out of Calendly's much larger
// invitee.created/invitee.canceled payloads — same "typed subset, not the
// whole vendor shape" approach as StripeInvoiceObject in
// src/app/api/webhooks/stripe/route.ts.
type CalendlyInviteePayload = {
  uri: string;
  name: string;
  email: string;
  timezone?: string | null;
  text_reminder_number?: string | null;
  questions_and_answers?: { question: string; answer: string }[];
  cancellation?: { reason?: string | null };
  scheduled_event: {
    uri: string;
    start_time: string;
    end_time?: string | null;
    location?: { type?: string; join_url?: string };
  };
};

// Unauthenticated by nature — Calendly calls this directly, there's no
// session. Security is the signature check, not requireSession/requireRole
// (same split as src/app/api/webhooks/stripe/route.ts).
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("calendly-webhook-signature");

  let event: Awaited<ReturnType<typeof verifyCalendlyWebhookSignature>>;
  try {
    event = verifyCalendlyWebhookSignature(rawBody, sig);
  } catch (error) {
    if (error instanceof CalendlyWebhookError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  if (event.event === "invitee.created") {
    const p = event.payload as unknown as CalendlyInviteePayload;
    const scheduledEvent = p.scheduled_event;
    const location = scheduledEvent?.location;

    // Idempotent: a redelivered event must never create a second Lead.
    const existing = await prisma.lead.findUnique({ where: { calendlyInviteeUri: p.uri } });
    if (!existing) {
      const lead = await prisma.lead.create({
        data: {
          source: "CALENDLY",
          stage: "BOOKED",
          inviteeName: p.name,
          inviteeEmail: p.email,
          inviteePhone: extractPhoneAnswer(p.questions_and_answers, p.text_reminder_number),
          timezone: p.timezone ?? null,
          meetingStartAt: new Date(scheduledEvent.start_time),
          meetingEndAt: scheduledEvent.end_time ? new Date(scheduledEvent.end_time) : null,
          meetingJoinUrl: location?.join_url ?? null,
          calendlyEventUri: scheduledEvent.uri,
          calendlyInviteeUri: p.uri,
          answers: p.questions_and_answers ?? [],
        },
      });
      // No recordAudit here — AuditLog.actorId is a hard FK to User, and a
      // webhook-created Lead has no real user to attribute it to (same
      // reasoning as submitForm in src/lib/actions/public-forms.ts, which
      // also never calls recordAudit for the initial system/unauthenticated
      // creation — the audit trail starts once a real staff member acts on
      // it, via changeLeadStage/linkLeadToClient/markLeadLost). The fact
      // itself isn't lost: it's exactly what createdAt already records.
      await notifyLeadStaff(lead, "LEAD_BOOKED", `New Calendly booking from ${lead.inviteeName}`);
    }
  } else if (event.event === "invitee.canceled") {
    const p = event.payload as unknown as CalendlyInviteePayload;
    const lead = await prisma.lead.findUnique({ where: { calendlyInviteeUri: p.uri } });
    // Idempotent: ignore an unknown or already-canceled lead — a
    // redelivered event must not double-fire the notification.
    if (lead && !lead.canceledAt) {
      const updated = await prisma.lead.update({
        where: { id: lead.id },
        data: { canceledAt: new Date(), cancelReason: p.cancellation?.reason ?? null },
      });
      // No recordAudit here either, same reasoning as above — canceledAt/
      // cancelReason on the row itself is the durable record of this event.
      await notifyLeadStaff(updated, "LEAD_CANCELED", `${lead.inviteeName}'s booking was canceled`);
    }
  }

  return NextResponse.json({ received: true });
}

// There's no "assigned owner" concept for a Lead yet (that's a later,
// separate backlog item) — notify every active ADMIN/MANAGER so a new
// booking always reaches someone who can triage it. actorId "system" (not
// a real user id) since this is Calendly telling us something happened,
// not a user's own action — notify()'s self-skip check must never
// accidentally suppress it (same sentinel the Stripe webhook uses).
async function notifyLeadStaff(lead: Lead, type: "LEAD_BOOKED" | "LEAD_CANCELED", message: string) {
  const recipients = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, active: true },
    select: { id: true },
  });
  for (const recipient of recipients) {
    await notify({ userId: recipient.id, type, message, entityType: "Lead", entityId: lead.id }, "system");
  }
}
