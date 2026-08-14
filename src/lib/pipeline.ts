import type { $Enums } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// LicenseTypeTemplate name -> pipeline (docs/pipeline-stage-plan.md). Single
// source of truth — scripts/backfill-application-stages.ts mirrors this
// exact mapping for the one-time historical backfill.
const TEMPLATE_TO_PIPELINE: Record<string, $Enums.Pipeline> = {
  CILA: "CILA_GROUP_HOME",
  IDPH: "HOME_CARE",
  IDOA: "HOME_CARE",
};

// Returns null when the license type isn't mapped (or wasn't set) — the
// caller decides what that means (skip pipeline assignment, flag for
// review, etc.) rather than this guessing.
export function pipelineForLicenseType(name: string | null | undefined): $Enums.Pipeline | null {
  if (!name) return null;
  return TEMPLATE_TO_PIPELINE[name] ?? null;
}

// The stage a case starts in when it enters a pipeline — lowest sortOrder,
// excluding exit statuses (On Hold / Withdrawn / Hearing Lost are reachable
// from anywhere but never where a case begins).
export async function getInitialStage(pipeline: $Enums.Pipeline) {
  return prisma.pipelineStage.findFirst({
    where: { pipeline, isExitStatus: false, active: true },
    orderBy: { sortOrder: "asc" },
  });
}
