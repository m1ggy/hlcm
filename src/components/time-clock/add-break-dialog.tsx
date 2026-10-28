"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addBreakToEntry } from "@/lib/actions/time-entries";
import { effectiveTimezone, formatDuration, hoursBetween } from "@/lib/time-entries";
import { TimeInput, TimezoneNote, formatClock, instantAtOrAfter, splitInstant } from "@/components/time-clock/time-fields";

const QUARTER_HOUR = 15 * 60_000;

// Admin-only: puts an unpaid break inside a finished session. The server
// splits the session around it (see addBreakToEntry), so paid hours drop
// by the break's length — previewed here before saving.
export function AddBreakDialog({
  entry,
  accountTimezone,
  onAdded,
}: {
  entry: { id: string; clockIn: Date; clockOut: Date; user: { name: string } };
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  onAdded?: () => void;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [isPending, startTransition] = useTransition();
  const day = splitInstant(entry.clockIn, timezone).date;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Suggest 30 minutes around the middle of the session, on a quarter hour.
      const length = entry.clockOut.getTime() - entry.clockIn.getTime();
      const breakLength = Math.min(30 * 60_000, Math.max(QUARTER_HOUR, Math.floor(length / 4 / QUARTER_HOUR) * QUARTER_HOUR));
      const mid = Math.round((entry.clockIn.getTime() + length / 2 - breakLength / 2) / QUARTER_HOUR) * QUARTER_HOUR;
      setStart(splitInstant(new Date(mid), timezone).time);
      setEnd(splitInstant(new Date(mid + breakLength), timezone).time);
    }
  }

  const from = start ? instantAtOrAfter(day, start, timezone, entry.clockIn) : null;
  const to = from && end ? instantAtOrAfter(day, end, timezone, new Date(from.getTime() + 60_000)) : null;
  const inside = Boolean(from && to && from > entry.clockIn && to < entry.clockOut);

  function handleSubmit() {
    if (!from || !to || !inside) {
      toast.error("The break has to fall inside the session");
      return;
    }
    startTransition(async () => {
      try {
        await addBreakToEntry(entry.id, { breakStart: from.toISOString(), breakEnd: to.toISOString() });
        toast.success(`Added a ${formatDuration(hoursBetween(from, to))} break`);
        setOpen(false);
        onAdded?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add break");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="xs" variant="ghost" title="Add a break" aria-label="Add a break">
            <Coffee className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a break</DialogTitle>
          <DialogDescription>
            {entry.user.name} · session {formatClock(entry.clockIn, timezone)} – {formatClock(entry.clockOut, timezone)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3">
            <TimeInput id="new-break-start" label="Break start" value={start} onChange={setStart} />
            <TimeInput id="new-break-end" label="Break end" value={end} onChange={setEnd} />
          </div>
          {from && to && (
            <p className={`text-sm ${inside ? "" : "text-destructive"}`}>
              {inside
                ? `Splits into ${formatClock(entry.clockIn, timezone)} – ${formatClock(from, timezone)} and ${formatClock(to, timezone)} – ${formatClock(entry.clockOut, timezone)}. Paid time drops by ${formatDuration(hoursBetween(from, to))}.`
                : "The break has to fall inside the session."}
            </p>
          )}
          <TimezoneNote timeZone={timezone} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={isPending} disabled={!inside}>
            Add break
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
