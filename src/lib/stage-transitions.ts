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

// Structural check only — same pipeline, and forward/backward/exit rules.
// Deliberately doesn't look at reason/followUpDate: a picker UI (Phase 7)
// needs to know "is this move on the map at all" separately from "does it
// still need a reason typed in", so the two are kept apart rather than
// folded into one boolean.
//
// Forward = higher sortOrder in the same pipeline, always allowed. Backward
// is denied unless the current stage's own whitelist names the target
// (Corrections Received -> Submitted, etc). Exit statuses (On Hold,
// Withdrawn, Hearing Lost) break both rules on purpose:
//   - reachable as a TARGET from any stage (pausing/closing doesn't care
//     where the case currently sits)
//   - reachable AS a SOURCE to any stage (resuming from a pause has no
//     natural "forward" direction to compare sortOrder against — a case on
//     hold isn't "ahead of" every real stage just because Hold sorts last)
export function isStructurallyReachable(current: PipelineStage, target: PipelineStage): boolean {
  if (current.pipeline !== target.pipeline) return false;
  if (current.id === target.id) return false;

  const movingFromExit = current.isExitStatus;
  const movingToExit = target.isExitStatus;
  const isForward = target.sortOrder > current.sortOrder;
  const isWhitelistedBackward = current.allowedBackwardStageIds.includes(target.id);

  return movingFromExit || movingToExit || isForward || isWhitelistedBackward;
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
    return current.pipeline !== target.pipeline
      ? { ok: false, message: `"${target.name}" isn't part of this case's pipeline.` }
      : {
          ok: false,
          message: `Can't move from "${current.name}" back to "${target.name}" — that move isn't allowed. Contact an admin if this needs an exception.`,
        };
  }

  if (target.requiresReason && !input.reason?.trim()) {
    return { ok: false, message: `"${target.name}" requires a reason.` };
  }
  if (target.requiresFollowUpDate && !input.followUpDate) {
    return { ok: false, message: `"${target.name}" requires a follow-up date.` };
  }

  return { ok: true };
}
