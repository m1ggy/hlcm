"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
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
import { updateTimeEntry } from "@/lib/actions/time-entries";
import { toDatetimeLocalValue, effectiveTimezone, zonedInputToISOString, timezoneLabel } from "@/lib/time-entries";

// Admin-only correction for an existing entry (wrong clock in/out time on
// someone else's session). Leaving "Clock out" blank re-opens the entry —
// the server checks that doesn't create a second open session for the user.
export function EditTimeEntryDialog({
  entry,
  accountTimezone,
  onUpdated,
}: {
  entry: { id: string; clockIn: Date; clockOut: Date | null };
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [isPending, startTransition] = useTransition();
  // Falls back to DEFAULT_TIMEZONE only when no Account setting is saved —
  // a plain server-provided string either way, so safe to resolve directly
  // (no SSR/hydration mismatch risk, unlike a browser-detected fallback).
  const timezone = effectiveTimezone(accountTimezone);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setClockIn(toDatetimeLocalValue(entry.clockIn, timezone));
      setClockOut(entry.clockOut ? toDatetimeLocalValue(entry.clockOut, timezone) : "");
    }
  }

  function handleSubmit() {
    if (!clockIn) {
      toast.error("Clock in is required");
      return;
    }
    startTransition(async () => {
      try {
        await updateTimeEntry(entry.id, {
          clockIn: zonedInputToISOString(clockIn, timezone),
          clockOut: clockOut ? zonedInputToISOString(clockOut, timezone) : null,
        });
        toast.success("Time entry updated");
        setOpen(false);
        onUpdated?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update time entry");
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
          <DialogTitle>Edit time entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Clock in</Label>
            <DateTimeInput value={clockIn} onChange={setClockIn} timeZone={timezone} clearable={false} />
          </div>
          <div className="space-y-1">
            <Label>Clock out</Label>
            <DateTimeInput value={clockOut} onChange={setClockOut} timeZone={timezone} />
            <p className="text-xs text-muted-foreground">Clear it to re-open this session.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Times are read in your timezone — {timezoneLabel(timezone)}.{" "}
            <a href="/account" className="underline">Change it</a>.
          </p>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
