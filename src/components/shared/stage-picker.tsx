"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type PickerStage = {
  id: string;
  abbrev: string;
  name: string;
  hex: string;
  isExitStatus: boolean;
  requiresReason: boolean;
  requiresFollowUpDate: boolean;
  reachable: boolean;
};

type CurrentStage = { abbrev: string; name: string; hex: string } | null;

// Type-to-search stage picker (docs/pipeline-stage-plan.md rule 7): abbrev
// or any part of the name, case-insensitive, Enter on the top match
// selects it directly (cmdk's default behavior, nothing extra needed).
// Every stage in the pipeline is listed and selectable — a disallowed move
// isn't hidden, it's dimmed as a hint, and the server is the real arbiter:
// selecting one just calls the move and shows the rejection message if it's
// not allowed, never silently no-ops.
export function StagePicker({
  currentStage,
  stages,
  onChange,
}: {
  currentStage: CurrentStage;
  stages: PickerStage[];
  onChange: (stageId: string, opts: { reason?: string; followUpDate?: string }) => Promise<unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<PickerStage | null>(null);
  const [reason, setReason] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPendingStage(null);
    setReason("");
    setFollowUpDate("");
  }

  function commit(stage: PickerStage, opts: { reason?: string; followUpDate?: string }) {
    startTransition(async () => {
      try {
        await onChange(stage.id, opts);
        toast.success(`Moved to ${stage.name}`);
        setOpen(false);
        reset();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to change stage");
      }
    });
  }

  function handleSelect(stage: PickerStage) {
    if (stage.requiresReason || stage.requiresFollowUpDate) {
      setPendingStage(stage);
      return;
    }
    commit(stage, {});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={currentStage ? { backgroundColor: currentStage.hex, color: "#fff" } : { color: "inherit" }}
            title={currentStage?.name}
          >
            {currentStage ? currentStage.abbrev : "No stage set"}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pendingStage ? `Move to "${pendingStage.name}"` : "Change stage"}</DialogTitle>
        </DialogHeader>
        {pendingStage ? (
          <div className="space-y-4">
            {pendingStage.requiresReason && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Reason</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            )}
            {pendingStage.requiresFollowUpDate && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Follow-up date</label>
                <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingStage(null)} disabled={isPending}>
                Back
              </Button>
              <Button onClick={() => commit(pendingStage, { reason, followUpDate })} disabled={isPending}>
                Confirm move
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search stage (abbrev or name)..." />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              <CommandGroup>
                {stages.map((stage) => (
                  <CommandItem
                    key={stage.id}
                    value={`${stage.abbrev} ${stage.name}`}
                    disabled={isPending}
                    onSelect={() => handleSelect(stage)}
                    className={stage.reachable ? undefined : "opacity-50"}
                  >
                    <span className="mr-2 inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.hex }} />
                    <span className="font-mono text-xs text-muted-foreground">{stage.abbrev}</span>
                    <span className="ml-2">{stage.name}</span>
                    {!stage.reachable && <span className="ml-auto text-xs text-muted-foreground">not a direct move</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </DialogContent>
    </Dialog>
  );
}
