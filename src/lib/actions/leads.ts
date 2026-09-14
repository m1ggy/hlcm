"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import type { $Enums } from "@/generated/prisma/client";

// Same reviewer tier as Form Submissions (src/lib/actions/form-submissions.ts)
// — no per-owner scoping, a Lead isn't owned by anyone until it's converted.
const REVIEW_ROLES: AppRole[] = ["ADMIN", "MANAGER", "STAFF"];

export async function listLeads(stage?: $Enums.LeadStage) {
  await requireRole(REVIEW_ROLES);
  return prisma.lead.findMany({
    where: { stage },
    include: {
      client: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
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

// Staff can move a Lead to any of the 6 stages, in any order — no
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
