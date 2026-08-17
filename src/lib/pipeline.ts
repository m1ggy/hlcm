import type { $Enums } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export { PIPELINE_LABELS } from "@/lib/pipeline-labels";

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

// Old ApplicationStatus -> new stage abbrev, per pipeline — the mapping in
// docs/pipeline-stage-plan.md. `null` means "ambiguous, don't auto-map";
// missing means "not expected for this pipeline". Shared by the historical
// backfill and any later one-off correction of a legacy row (e.g. a case
// with no LicenseTypeTemplate that couldn't be placed in a pipeline
// automatically) so both agree on the same real-world meaning of "Approved".
export const STATUS_TO_STAGE: Record<$Enums.Pipeline, Partial<Record<string, string | null>>> = {
  HOME_CARE: {
    DRAFT: "WCD",
    INFO_GATHERING: "CAP",
    SUBMITTED: "SUB",
    UNDER_AGENCY_REVIEW: "SUB",
    NEEDS_REVISION: "COR",
    APPROVED: "LRD",
    DENIED: "WDN",
    CLOSED: "WDN",
  },
  CILA_GROUP_HOME: {
    DRAFT: "S1 WCD",
    INFO_GATHERING: "S1 CAP",
    SUBMITTED: "S1 SUB",
    UNDER_AGENCY_REVIEW: "S1 SUB",
    NEEDS_REVISION: "S1 COR",
    APPROVED: "S1 APM", // confirmed by CTK — approved, awaiting mock
    DENIED: "WDN",
    CLOSED: "WDN",
  },
  MCO: {},
};
