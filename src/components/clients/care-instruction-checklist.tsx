"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  createCareInstruction,
  toggleCareInstruction,
  deleteCareInstruction,
} from "@/lib/actions/care-recipients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export type CareInstructionRow = { id: string; label: string; completed: boolean };

function InstructionRow({
  instruction,
  canManage,
}: {
  instruction: CareInstructionRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(checked: boolean) {
    startTransition(async () => {
      try {
        await toggleCareInstruction(instruction.id, checked);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update");
      }
    });
  }

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
    <label className="flex items-center gap-2 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/60">
      <Checkbox checked={instruction.completed} onCheckedChange={handleToggle} disabled={isPending} />
      <span className={instruction.completed ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>
        {instruction.label}
      </span>
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
    </label>
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

// Concrete, checkable requests for a visit — "Give medication at 2pm" —
// distinct from careNotes (background read once). Used both on the admin
// Care Recipients card (canManage: add/remove + toggle) and the Caregiver's
// own My Recipients page (toggle only — see toggleCareInstruction's own
// assignment check in src/lib/actions/care-recipients.ts).
export function CareInstructionChecklist({
  careRecipientId,
  instructions,
  canManage = false,
  hideHeader = false,
}: {
  careRecipientId: string;
  instructions: CareInstructionRow[];
  canManage?: boolean;
  /** The caller already renders its own "To do this visit" + progress
   * header (see the Caregiver's My Recipients page) — skip the internal
   * one rather than show it twice. */
  hideHeader?: boolean;
}) {
  const done = instructions.filter((i) => i.completed).length;

  return (
    <div className="space-y-0.5">
      {!hideHeader && (instructions.length > 0 || canManage) && (
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To do this visit</p>
          {instructions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {done}/{instructions.length} done
            </span>
          )}
        </div>
      )}
      {instructions.map((i) => (
        <InstructionRow key={i.id} instruction={i} canManage={canManage} />
      ))}
      {canManage && <AddInstructionRow careRecipientId={careRecipientId} />}
    </div>
  );
}
