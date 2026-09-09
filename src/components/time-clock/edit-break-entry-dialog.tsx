"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateBreakEntry } from "@/lib/actions/time-entries";
import { toDatetimeLocalValue, effectiveTimezone, zonedInputToISOString, timezoneLabel } from "@/lib/time-entries";

// Admin-only correction for an existing break (wrong break start/end time on
// someone else's session) — same shape as EditTimeEntryDialog, just against
// BreakEntry. Leaving "Break end" blank re-opens the break — the server
// checks that doesn't create a second open break for the user.
export function EditBreakEntryDialog({
  entry,
  accountTimezone,
  onUpdated,
}: {
  entry: { id: string; breakStart: Date; breakEnd: Date | null };
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [isPending, startTransition] = useTransition();
  const timezone = effectiveTimezone(accountTimezone);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setBreakStart(toDatetimeLocalValue(entry.breakStart, timezone));
      setBreakEnd(entry.breakEnd ? toDatetimeLocalValue(entry.breakEnd, timezone) : "");
    }
  }

  function handleSubmit() {
    if (!breakStart) {
      toast.error("Break start is required");
      return;
    }
    startTransition(async () => {
      try {
        await updateBreakEntry(entry.id, {
          breakStart: zonedInputToISOString(breakStart, timezone),
          breakEnd: breakEnd ? zonedInputToISOString(breakEnd, timezone) : null,
        });
        toast.success("Break updated");
        setOpen(false);
        onUpdated?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update break");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="xs" variant="ghost" title="Edit">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit break</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Break start</Label>
            <DateTimeInput value={breakStart} onChange={setBreakStart} timeZone={timezone} clearable={false} />
          </div>
          <div className="space-y-1">
            <Label>Break end</Label>
            <DateTimeInput value={breakEnd} onChange={setBreakEnd} timeZone={timezone} />
            <p className="text-xs text-muted-foreground">Clear it to re-open this break.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Times are read in your timezone — {timezoneLabel(timezone)}.{" "}
            <a href="/account" className="underline">Change it</a>.
          </p>
          <Button onClick={handleSubmit} loading={isPending} className="w-full">
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
