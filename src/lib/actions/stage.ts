"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess, requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { resolveStageChange, isStructurallyReachable } from "@/lib/stage-transitions";
import type { $Enums } from "@/generated/prisma/client";

// Board columns for a pipeline — non-exit stages only. On Hold / Withdrawn /
// Hearing Lost are reachable from any stage per the spec, but a Kanban drag
// can't collect the reason/follow-up-date those require (that's what the
// StagePicker's confirm step is for), so they're deliberately not columns
// here — reaching them still works via the picker on the case detail page.
export async function listPipelineStages(pipeline: $Enums.Pipeline, opts: { includeExit?: boolean } = {}) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.pipelineStage.findMany({
    where: { pipeline, active: true, ...(opts.includeExit ? {} : { isExitStatus: false }) },
    orderBy: { sortOrder: "asc" },
  });
}

// Moves an Application to a different stage within its own pipeline —
// forward moves and exit statuses (On Hold/Withdrawn/Hearing Lost) are
// always allowed, backward moves only if explicitly whitelisted (see
// resolveStageChange / docs/pipeline-stage-plan.md rule 2). Same edit-access
// check as the old status field (assigned user, access grant, or
// admin/manager) — nothing new to configure there.
export async function changeApplicationStage(
  applicationId: string,
  targetStageId: string,
  opts: { reason?: string; followUpDate?: string } = {}
) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { stage: true },
  });
  if (!application.stage) {
    throw new Error("This case doesn't have a pipeline stage set yet — contact an admin.");
  }

  const targetStage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: targetStageId } });

  const followUpDate = opts.followUpDate ? new Date(opts.followUpDate) : null;
  const result = resolveStageChange(application.stage, targetStage, { reason: opts.reason, followUpDate });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const [updated] = await prisma.$transaction([
    prisma.application.update({ where: { id: applicationId }, data: { stageId: targetStage.id } }),
    prisma.stageHistory.create({
      data: {
        applicationId,
        stageId: targetStage.id,
        reason: opts.reason?.trim() || null,
        followUpDate,
        actorId: session.user.id,
      },
    }),
  ]);

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "change_stage",
    actorId: session.user.id,
    oldValue: application.stage.name,
    newValue: targetStage.name,
  });

  // Reuses the existing status-change notification type — same category of
  // event (case moved somewhere) from the recipient's point of view, no need
  // for a parallel enum value.
  const grantees = await prisma.accessGrant.findMany({ where: { applicationId }, select: { userId: true } });
  const recipients = new Set([application.assignedUserId, ...grantees.map((g) => g.userId)]);
  for (const userId of recipients) {
    await notify(
      {
        userId,
        type: "APPLICATION_STATUS_CHANGED",
        message: `"${application.name}" moved to ${targetStage.name}`,
        entityType: "Application",
        entityId: applicationId,
      },
      session.user.id
    );
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  return updated;
}

// The set of stages a case in its current stage is actually allowed to move
// to — for a picker UI (Phase 7) to grey out / hide disallowed targets
// instead of letting someone pick one and then rejecting it.
export async function listReachableStages(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { stage: true },
  });
  if (!application.stage || !application.pipeline) return [];

  const allStages = await prisma.pipelineStage.findMany({
    where: { pipeline: application.pipeline, active: true },
    orderBy: { sortOrder: "asc" },
  });

  return allStages
    .filter((s) => s.id !== application.stage!.id)
    .map((s) => ({
      ...s,
      reachable: isStructurallyReachable(application.stage!, s),
    }));
}
