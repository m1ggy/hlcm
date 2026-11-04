"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateBreakEntry } from "@/lib/actions/time-entries";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { effectiveTimezone, formatDuration, hoursBetween } from "@/lib/time-entries";
import { StartEndFields, TimezoneNote, useStartEnd } from "@/components/time-clock/time-fields";

// Admin-only correction for an existing break. The server moves the edges
// of the work sessions on either side along with it, so paid hours follow.
export function EditBreakEntryDialog({
  entry,
  accountTimezone,
  onUpdated,
}: {
  entry: { id: string; breakStart: Date; breakEnd: Date | null; user: { name: string } };
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onUpdated?: () => void;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [open, setOpen] = useState(false);
  const [stillOpen, setStillOpen] = useState(false);
  const fields = useStartEnd(timezone, stillOpen);
  const { from, range } = fields;
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      fields.reset(entry.breakStart, entry.breakEnd);
      setStillOpen(!entry.breakEnd);
    }
  }

  function handleSubmit() {
    if (!from || (!stillOpen && !range)) {
      toast.error(fields.endBeforeStart ? "The end has to be after the start" : "Fill in the dates and times");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateBreakEntry(entry.id, {
          breakStart: from.toISOString(),
          breakEnd: range ? range.to.toISOString() : null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Break updated");
        setOpen(false);
        onUpdated?.();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the break — try again"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="xs" variant="ghost" title="Edit break" aria-label="Edit break">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit break</DialogTitle>
          <DialogDescription>
            {entry.user.name} · the work time before and after moves with the break, so paid hours stay right.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <StartEndFields idPrefix="break" startLabel="Break start" endLabel="Break end" fields={fields} endDisabled={stillOpen} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={stillOpen} onCheckedChange={(c) => setStillOpen(c === true)} />
            Still on break (no end yet)
          </label>
          {range && <p className="text-sm">{formatDuration(hoursBetween(range.from, range.to))} break</p>}
          <TimezoneNote timeZone={timezone} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
