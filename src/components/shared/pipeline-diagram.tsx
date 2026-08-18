"use client";

import { useEffect, useState } from "react";
import { Waypoints, ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DiagramStage = {
  id: string;
  abbrev: string;
  name: string;
  hex: string;
  sortOrder: number;
  isExitStatus: boolean;
  requiresReason: boolean;
  requiresFollowUpDate: boolean;
  allowedBackwardStageIds: string[];
};

// Readable-text-on-color, same rule ServicePill/stage chips already use
// elsewhere — the seeded catalog's hexes are dark enough that white always
// reads, so no luminance check needed (matches every other stage chip in
// the app: application-stage-picker, mco-stage-picker, kanban columns).
function StageChip({ stage }: { stage: DiagramStage }) {
  return (
    <div
      className="flex min-w-[7rem] max-w-[9rem] flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-center shadow-sm"
      style={{ backgroundColor: stage.hex, color: "#fff" }}
    >
      <span className="text-xs font-bold tracking-wide">{stage.abbrev}</span>
      <span className="text-[0.65rem] leading-tight opacity-90">{stage.name}</span>
    </div>
  );
}

// A pure reference view of a pipeline's stage catalog — never tied to any
// one case. Forward order comes straight from sortOrder (the spec's rule
// that abbreviations must never drive sorting); backward-move whitelist
// entries render as a small "back to X" caption under the source stage,
// since drawing arrows across a wrapping flex row gets unreadable fast once
// a pipeline has two dozen stages (CILA).
export function PipelineDiagram({ pipeline, stages }: { pipeline: string; stages: DiagramStage[] }) {
  const flow = stages.filter((s) => !s.isExitStatus).sort((a, b) => a.sortOrder - b.sortOrder);
  const exits = stages.filter((s) => s.isExitStatus).sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(stages.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-4">
        {flow.map((stage, i) => {
          const backTargets = stage.allowedBackwardStageIds
            .map((id) => byId.get(id))
            .filter((s): s is DiagramStage => !!s);
          return (
            <div key={stage.id} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
              <div className="flex flex-col items-center gap-1">
                <StageChip stage={stage} />
                {backTargets.length > 0 && (
                  <div className="flex items-center gap-0.5 text-[0.65rem] text-muted-foreground">
                    <Undo2 className="size-2.5" />
                    {backTargets.map((t) => t.abbrev).join(", ")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {exits.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Exit statuses — reachable from any stage above, and can resume back to any stage
          </p>
          <div className="flex flex-wrap gap-3">
            {exits.map((stage) => (
              <div key={stage.id} className="flex flex-col items-center gap-1">
                <StageChip stage={stage} />
                <span className="text-[0.65rem] text-muted-foreground">
                  {stage.requiresReason && stage.requiresFollowUpDate
                    ? "Needs a reason + follow-up date"
                    : stage.requiresReason
                      ? "Needs a reason"
                      : "No reason required"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PipelineDiagramDialog({
  pipeline,
  pipelineLabel,
  stages,
  autoOpenKey,
}: {
  pipeline: string;
  pipelineLabel: string;
  stages: DiagramStage[];
  // Opens the dialog once, unprompted, the first time a user ever lands on
  // this pipeline — a new pipeline is not self-explanatory from a colored
  // pill alone, so the reference diagram gets shown instead of waiting to be
  // found. Persisted in localStorage (per user, per browser) so it never
  // repeats after that first look. Omit to keep the dialog fully opt-in
  // (e.g. if the same pipeline's diagram is rendered more than once on a page).
  autoOpenKey?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpenKey) return;
    const seenKey = `hclm:pipeline-map-seen:${autoOpenKey}`;
    if (window.localStorage.getItem(seenKey)) return;
    window.localStorage.setItem(seenKey, "1");
    // Deliberately opening the dialog in response to a prop change (a new
    // pipeline tab that hasn't been seen before), not deriving render state
    // from render — there's no way to know "seen" without checking
    // localStorage, so this can't be a plain derived value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [autoOpenKey]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Waypoints className="size-3.5" /> Pipeline map
          </Button>
        }
      />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{pipelineLabel} — stage flow</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pt-2">
          <PipelineDiagram pipeline={pipeline} stages={stages} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
