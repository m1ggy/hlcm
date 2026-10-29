"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateTimeEntry } from "@/lib/actions/time-entries";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { effectiveTimezone, formatDuration, hoursBetween } from "@/lib/time-entries";
import { StartEndFields, TimezoneNote, useStartEnd } from "@/components/time-clock/time-fields";

const NO_VISIT = "__none__";

// Admin-only correction for an existing entry: same date + start/end
// fields as Add time, "Still clocked in" instead of clearing a field to
// re-open it (the server checks that doesn't create a second open session),
// and the visit it belongs to.
export function EditTimeEntryDialog({
  entry,
  recipients = [],
  accountTimezone,
  onUpdated,
}: {
  entry: {
    id: string;
    clockIn: Date;
    clockOut: Date | null;
    user: { name: string };
    careRecipient: { id: string; name: string } | null;
  };
  recipients?: { id: string; name: string }[];
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onUpdated?: () => void;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [open, setOpen] = useState(false);
  const [stillOpen, setStillOpen] = useState(false);
  const fields = useStartEnd(timezone, stillOpen);
  const { from, range } = fields;
  const [visitId, setVisitId] = useState(NO_VISIT);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      fields.reset(entry.clockIn, entry.clockOut);
      setStillOpen(!entry.clockOut);
      setVisitId(entry.careRecipient?.id ?? NO_VISIT);
    }
  }

  // A recipient no longer in the active list still shows by name.
  const visitItems = {
    [NO_VISIT]: "Not a visit",
    ...Object.fromEntries(recipients.map((r) => [r.id, r.name])),
    ...(entry.careRecipient ? { [entry.careRecipient.id]: entry.careRecipient.name } : {}),
  };

  function handleSubmit() {
    if (!from || (!stillOpen && !range)) {
      toast.error(fields.endBeforeStart ? "The end has to be after the start" : "Fill in the dates and times");
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateTimeEntry(entry.id, {
          clockIn: from.toISOString(),
          clockOut: range ? range.to.toISOString() : null,
          careRecipientId: visitId === NO_VISIT ? null : visitId,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Time updated");
        setOpen(false);
        onUpdated?.();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the time — try again"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="xs" variant="ghost" title="Edit time" aria-label="Edit time">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit time</DialogTitle>
          <DialogDescription>
            {entry.user.name} ·{" "}
            {entry.clockIn.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: timezone })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {(recipients.length > 0 || entry.careRecipient) && (
            <div className="space-y-1">
              <Label>Visit</Label>
              <SearchableSelect
                items={visitItems}
                value={visitId}
                onValueChange={(v) => setVisitId(v ?? NO_VISIT)}
                searchPlaceholder="Search recipients..."
              />
              {entry.careRecipient && (
                <p className="text-xs text-muted-foreground">Changing this updates every part of the visit, including after breaks.</p>
              )}
            </div>
          )}
          <StartEndFields idPrefix="edit" startLabel="Start" endLabel="End" fields={fields} endDisabled={stillOpen} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={stillOpen} onCheckedChange={(c) => setStillOpen(c === true)} />
            Still clocked in (no end yet)
          </label>
          {range && <p className="text-sm">{formatDuration(hoursBetween(range.from, range.to))} paid</p>}
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
