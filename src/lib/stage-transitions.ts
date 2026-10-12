// Pure stage-transition rules (docs/pipeline-stage-plan.md, developer rule 2)
// — no DB access, so this is unit-testable directly. The "use server" action
// in src/lib/actions/stage.ts wraps this with auth, loading the rows, and
// persisting the result.
import type { PipelineStage } from "@/generated/prisma/client";

export type StageChangeInput = {
  reason?: string | null;
  followUpDate?: Date | null;
};

export type StageChangeResult = { ok: true } | { ok: false; message: string };

// Structural check only — same pipeline, different stage. Deliberately
// doesn't look at reason/followUpDate: a picker UI (Phase 7) needs to know
// "is this move on the map at all" separately from "does it still need a
// reason typed in", so the two are kept apart rather than folded into one
// boolean.
//
// Any stage in the same pipeline is reachable, forward or backward. The
// original spec (rule 2) only allowed whitelisted backward moves
// (allowedBackwardStageIds), but in practice staff need to correct
// mis-clicks and step cases back freely, so that restriction was dropped.
// allowedBackwardStageIds is still seeded and drawn by the pipeline
// diagram as the "expected" back-paths, it just isn't enforced.
export function isStructurallyReachable(current: PipelineStage, target: PipelineStage): boolean {
  if (current.pipeline !== target.pipeline) return false;
  return current.id !== target.id;
}

// Spec field ("Days in current stage: auto counted from the last stage
// change timestamp") — same formula alerts.ts already used inline for its
// threshold checks, pulled out here so the visible field and the alert
// thresholds can't drift apart.
export function daysInStage(enteredAt: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - enteredAt.getTime()) / 86_400_000);
}

export function resolveStageChange(
  current: PipelineStage,
  target: PipelineStage,
  input: StageChangeInput
): StageChangeResult {
  if (current.id === target.id) {
    return { ok: false, message: `Already at "${current.name}".` };
  }
  if (!isStructurallyReachable(current, target)) {
    return { ok: false, message: `"${target.name}" isn't part of this case's pipeline.` };
  }

  if (target.requiresReason && !input.reason?.trim()) {
    return { ok: false, message: `"${target.name}" requires a reason.` };
  }
  if (target.requiresFollowUpDate && !input.followUpDate) {
    return { ok: false, message: `"${target.name}" requires a follow-up date.` };
  }

  return { ok: true };
}
