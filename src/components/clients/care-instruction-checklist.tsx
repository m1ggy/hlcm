"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { createCareInstruction, deleteCareInstruction } from "@/lib/actions/care-recipients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CareInstructionRow = { id: string; label: string };

function InstructionRow({
  instruction,
  canManage,
  doneLastVisit,
}: {
  instruction: CareInstructionRow;
  canManage: boolean;
  /** Staff view: whether this was ticked on the most recent visit
   * (undefined = no visit yet, so no marker at all). */
  doneLastVisit?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCareInstruction(instruction.id);
        toast.success("Instruction removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove instruction");
      }
    });
  }

  return (
    <div className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
      <span className="text-muted-foreground">•</span>
      <span className="flex-1 text-sm">{instruction.label}</span>
      {doneLastVisit !== undefined && (
        <span
          className={doneLastVisit ? "flex items-center gap-0.5 text-xs text-green-700 dark:text-green-400" : "text-xs text-amber-700 dark:text-amber-400"}
          title="On the most recent visit"
        >
          {doneLastVisit ? (
            <>
              <Check className="size-3" /> Done last visit
            </>
          ) : (
            "Not done last visit"
          )}
        </span>
      )}
      {canManage && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function AddInstructionRow({ careRecipientId }: { careRecipientId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await createCareInstruction(careRecipientId, label.trim());
        setLabel("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add instruction");
      }
    });
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
        placeholder="Add an instruction..."
        className="h-7 text-xs"
      />
      <Button size="xs" variant="outline" onClick={handleAdd} disabled={!label.trim()} loading={isPending}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
}

// Concrete requests for whoever visits — "Give medication at 2pm" —
// distinct from careNotes (background read once). This is the standing
// list: staff add/remove here (canManage); a Caregiver sees it read-only on
// My Recipients and checks items off per visit on their Today page (see
// VisitChecklist and VisitInstructionCheck).
export function CareInstructionChecklist({
  careRecipientId,
  instructions,
  canManage = false,
  lastVisitCheckedIds,
}: {
  careRecipientId: string;
  instructions: CareInstructionRow[];
  canManage?: boolean;
  /** Staff view: instruction ids ticked on the most recent visit, to show
   * how it went per item. Omitted when there's been no visit. */
  lastVisitCheckedIds?: string[];
}) {
  const lastChecked = lastVisitCheckedIds ? new Set(lastVisitCheckedIds) : null;

  return (
    <div className="space-y-0.5">
      {(instructions.length > 0 || canManage) && (
        <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Care tasks each visit</p>
      )}
      {instructions.map((i) => (
        <InstructionRow
          key={i.id}
          instruction={i}
          canManage={canManage}
          doneLastVisit={lastChecked ? lastChecked.has(i.id) : undefined}
        />
      ))}
      {canManage && <AddInstructionRow careRecipientId={careRecipientId} />}
    </div>
  );
}
