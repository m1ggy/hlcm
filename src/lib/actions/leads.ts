"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import type { $Enums } from "@/generated/prisma/client";

// Same reviewer tier as Form Submissions (src/lib/actions/form-submissions.ts)
// — no per-owner scoping, a Lead isn't owned by anyone until it's converted.
const REVIEW_ROLES: AppRole[] = ["ADMIN", "MANAGER", "STAFF"];

const taskLinkSelect = { id: true, label: true, status: true, dueDate: true } as const;

export async function listLeads(stage?: $Enums.LeadStage) {
  await requireRole(REVIEW_ROLES);
  return prisma.lead.findMany({
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
  return prisma.lead.findUniqueOrThrow({
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

  const before = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { assignedToId: true } });
  const lead = await prisma.lead
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

  const before = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { stage: true } });
  const lead = await prisma.lead
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
    const alreadyHasTask = await prisma.task.findFirst({ where: { leadId: id }, select: { id: true } });
    if (!alreadyHasTask) {
      await prisma.task.create({
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

  const lead = await prisma.lead
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

  await prisma.lead
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

// The org's own Calendly page — the same URL this app's whole Calendly
// integration is already built around (README's setup runbook, the
// webhook subscription). Not user-configurable in v1: no admin-settings
// surface exists anywhere in this app for editable email copy, and
// building one would be disproportionate to "one canned line with a link."
const CALENDLY_BOOKING_URL = "https://calendly.com/ctkadvisorsinc";

// One click, no confirmation dialog — unlike markLeadLost, this isn't
// destructive, and the backlog's own ask ("so follow-up goes out within
// minutes") is specifically about removing friction. Not restricted to
// NO_SHOW/MISSED — a plain rebooking nudge is reasonable from other stages
// too, so this is gated the same way every other action button in the
// Leads inbox already is (not CONVERTED/LOST).
export async function sendFollowUpEmail(leadId: string) {
  const session = await requireRole(REVIEW_ROLES);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });

  await sendEmail({
    to: lead.inviteeEmail,
    subject: "Let's find a new time",
    html: renderEmailLayout({
      heading: "We missed you",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${lead.inviteeName}, we'd still love to connect — pick a new time that works for you:</p>`,
      ctaLabel: "Rebook a time",
      ctaUrl: CALENDLY_BOOKING_URL,
      preheader: "Pick a new time that works for you",
    }),
  });

  await prisma.lead.update({ where: { id: leadId }, data: { stage: "FOLLOW_UP_SENT" } });

  await recordAudit({
    entityType: "Lead",
    entityId: leadId,
    action: "send_followup",
    actorId: session.user.id,
    newValue: lead.inviteeEmail,
  });

  revalidatePath("/leads");
}
