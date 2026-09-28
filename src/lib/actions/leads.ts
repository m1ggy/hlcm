"use server";

import { revalidatePath } from "next/cache";
import { db, currentOrganization } from "@/lib/db";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { sendEmail, renderEmailLayout, getEmailBranding } from "@/lib/email";
import { createSingleUseSchedulingLink, cancelScheduledEvent, getCalendlyBookingUrl } from "@/lib/calendly";
import { UserFacingError } from "@/lib/user-facing-error";
import type { $Enums } from "@/generated/prisma/client";

// Same reviewer tier as Form Submissions (src/lib/actions/form-submissions.ts)
// — no per-owner scoping, a Lead isn't owned by anyone until it's converted.
const REVIEW_ROLES: AppRole[] = ["ADMIN", "MANAGER", "STAFF"];

const taskLinkSelect = { id: true, label: true, status: true, dueDate: true } as const;

export async function listLeads(stage?: $Enums.LeadStage) {
  await requireRole(REVIEW_ROLES);
  return db.lead.findMany({
    where: { stage },
    include: {
      client: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      tasks: { select: taskLinkSelect, orderBy: { createdAt: "desc" } },
    },
    orderBy: { meetingStartAt: "desc" },
  });
}

export async function getLead(id: string) {
  await requireRole(REVIEW_ROLES);
  return db.lead.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      tasks: { select: taskLinkSelect, orderBy: { createdAt: "desc" } },
    },
  });
}

// Who follows up on this booking — drives the meeting-reminder notify()/
// Teams post (src/lib/meeting-reminders.ts). userId null clears it.
export async function assignLead(leadId: string, userId: string | null) {
  const session = await requireRole(REVIEW_ROLES);

  const before = await db.lead.findUniqueOrThrow({ where: { id: leadId }, select: { assignedToId: true } });
  const lead = await db.lead
    .update({
      where: { id: leadId },
      data: { assignedToId: userId },
      include: { assignedTo: { select: { id: true, name: true } } },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That lead is already gone — someone else may have just deleted it" }));

  // Generic field-change shape (action "update", field "assignedToId"),
  // same as how Application.assignedUserId is audited — not a bespoke
  // "assign" event action, so a user-id lookup map can resolve names later
  // if a History panel gets added to /leads.
  await recordAudit({
    entityType: "Lead",
    entityId: leadId,
    action: "update",
    actorId: session.user.id,
    field: "assignedToId",
    oldValue: before.assignedToId,
    newValue: userId,
  });

  revalidatePath("/leads");
  return lead;
}

// Staff can move a Lead to any of the 8 stages, in any order — no
// backward-move whitelist like the Application pipeline enforces (see
// docs/pipeline-stage-plan.md). This is a staff-initiated action, not
// something the system tells anyone about, so no notify() call — same as
// FormSubmission's dismiss/link, which also don't notify.
export async function changeLeadStage(id: string, stage: $Enums.LeadStage) {
  const session = await requireRole(REVIEW_ROLES);

  const before = await db.lead.findUniqueOrThrow({ where: { id }, select: { stage: true } });
  const lead = await db.lead
    .update({ where: { id }, data: { stage } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That lead is already gone — someone else may have just deleted it" }));

  await recordAudit({
    entityType: "Lead",
    entityId: id,
    action: "change_stage",
    actorId: session.user.id,
    field: "stage",
    oldValue: before.stage,
    newValue: stage,
  });

  // Attendance tracking's "required follow-up task" — a side effect of
  // landing on either outcome, whichever path sets it (today: this same
  // dropdown any other stage change goes through). Guarded against
  // duplicates so re-clicking (or moving away and back) never creates a
  // second one for the same lead.
  if (stage === "NO_SHOW" || stage === "MISSED") {
    const alreadyHasTask = await db.task.findFirst({ where: { leadId: id }, select: { id: true } });
    if (!alreadyHasTask) {
      await db.task.create({
        data: {
          leadId: id,
          label: `Follow up: ${lead.inviteeName} (${stage === "NO_SHOW" ? "No-show" : "Missed"})`,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: session.user.id,
          assignees: { create: { userId: lead.assignedToId ?? session.user.id } },
        },
      });
    }
  }

  revalidatePath("/leads");
  return lead;
}

// The shared last step whether a brand-new Client was just created from
// this lead's details, or it was matched to one that already exists —
// createClient itself (src/lib/actions/clients.ts) is called directly by
// the review UI beforehand for the "new client" case, so this file never
// duplicates client-creation logic. Mirrors linkSubmissionToClient exactly.
export async function linkLeadToClient(leadId: string, clientId: string) {
  const session = await requireRole(REVIEW_ROLES);

  const lead = await db.lead
    .update({
      where: { id: leadId },
      data: { clientId, stage: "CONVERTED", reviewedById: session.user.id, reviewedAt: new Date() },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That lead is already gone — someone else may have just deleted it" }));

  await recordAudit({
    entityType: "Lead",
    entityId: leadId,
    action: "link_client",
    actorId: session.user.id,
    newValue: clientId,
  });

  revalidatePath("/leads");
  return lead;
}

// The Lead equivalent of dismissSubmission — Lost IS the dismiss path for a
// lead that never converts, not a separate delete/hide state.
export async function markLeadLost(id: string, reason?: string) {
  const session = await requireRole(REVIEW_ROLES);

  await db.lead
    .update({ where: { id }, data: { stage: "LOST" } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That lead is already gone — someone else may have just deleted it" }));

  await recordAudit({
    entityType: "Lead",
    entityId: id,
    action: "mark_lost",
    actorId: session.user.id,
    newValue: reason,
  });

  revalidatePath("/leads");
}

// One click, no confirmation dialog — unlike markLeadLost, this isn't
// destructive, and the backlog's own ask ("so follow-up goes out within
// minutes") is specifically about removing friction. Not restricted to
// NO_SHOW/MISSED — a plain rebooking nudge is reasonable from other stages
// too, so this is gated the same way every other action button in the
// Leads inbox already is (not CONVERTED/LOST).
export async function sendFollowUpEmail(leadId: string) {
  const session = await requireRole(REVIEW_ROLES);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });

  // A real single-use link (same event type as their original booking)
  // beats the generic org page when we can get one — but a Calendly hiccup
  // (token unset, API error) must never block the follow-up email itself
  // from going out, so this falls back to the org's public booking page
  // (Admin > Integrations > Calendly) on any failure.
  let bookingUrl = await getCalendlyBookingUrl();
  try {
    bookingUrl = await createSingleUseSchedulingLink(lead.calendlyEventUri);
  } catch (error) {
    console.error("Falling back to the generic Calendly link:", error);
  }
  if (!bookingUrl) {
    throw new UserFacingError("No booking link to send — add your Calendly booking page in Admin > Integrations.");
  }

  const { appUrl, brand } = await getEmailBranding();
  await sendEmail({
    to: lead.inviteeEmail,
    subject: "Let's find a new time",
    html: renderEmailLayout({
      heading: "We missed you",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${lead.inviteeName}, we'd still love to connect — pick a new time that works for you:</p>`,
      ctaLabel: "Rebook a time",
      ctaUrl: bookingUrl,
      preheader: "Pick a new time that works for you",
      appUrl,
      brand,
    }),
  });

  await db.lead.update({ where: { id: leadId }, data: { stage: "FOLLOW_UP_SENT" } });

  await recordAudit({
    entityType: "Lead",
    entityId: leadId,
    action: "send_followup",
    actorId: session.user.id,
    newValue: lead.inviteeEmail,
  });

  revalidatePath("/leads");
}

// Standalone action, not folded into markLeadLost — canceling a specific
// calendar event doesn't map cleanly to any one stage transition (No-show/
// Missed already happened, Lost can happen long after), and it sends the
// invitee a real cancellation email, so it gets its own explicit confirm in
// the UI. Unlike sendFollowUpEmail, no fallback on failure: this is a
// destructive action expecting a real effect, so an unconfigured token or
// API error surfaces as a toast rather than silently no-op'ing.
export async function cancelLeadBooking(leadId: string, reason?: string) {
  const session = await requireRole(REVIEW_ROLES);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.canceledAt) throw new Error("This booking is already canceled");

  const cancelReason = reason || `Canceled by ${(await currentOrganization()).name} staff`;
  await cancelScheduledEvent(lead.calendlyEventUri, cancelReason);

  // Set canceledAt here rather than waiting on Calendly's own
  // invitee.canceled webhook round-trip, so the UI reflects it immediately.
  // When that webhook does arrive afterward, the existing idempotency check
  // in src/app/api/webhooks/calendly/route.ts (`if (lead && !lead.canceledAt)`)
  // sees it's already set and no-ops — no duplicate notify, no feedback loop.
  await db.lead.update({
    where: { id: leadId },
    data: { canceledAt: new Date(), cancelReason },
  });

  await recordAudit({
    entityType: "Lead",
    entityId: leadId,
    action: "cancel_booking",
    actorId: session.user.id,
    newValue: reason,
  });

  revalidatePath("/leads");
}
