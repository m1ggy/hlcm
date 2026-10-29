"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { createManualTimeEntry } from "@/lib/actions/time-entries";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { effectiveTimezone, formatDuration, hoursBetween, zonedNowParts } from "@/lib/time-entries";
import { StartEndFields, TimeInput, TimezoneNote, dayOf, instantAtOrAfter, useStartEnd } from "@/components/time-clock/time-fields";

const NO_VISIT = "__none__";

// Admin-only backfill for a session someone forgot to clock, or a
// correction for a missed punch — always a completed shift, unlike the
// clock widget which starts an open entry. Start and end each have a date
// and time (an overnight shift ends on the next day), an optional unpaid break
// stored like a real one, and an optional visit so the time counts toward
// that recipient's billable hours.
export function AddTimeEntryDialog({
  users,
  recipients = [],
  accountTimezone,
  defaultUserId,
  onAdded,
}: {
  users: { id: string; name: string }[];
  recipients?: { id: string; name: string }[];
  /** The admin's own Account timezone setting, or null if unset. */
  accountTimezone: string | null;
  /** The report's current user filter — "all" or a user id. */
  defaultUserId?: string;
  onAdded?: () => void;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [visitId, setVisitId] = useState(NO_VISIT);
  const fields = useStartEnd(timezone, false);
  const date = fields.startDate;
  const [withBreak, setWithBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("12:30");
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setUserId(defaultUserId && defaultUserId !== "all" ? defaultUserId : "");
      setVisitId(NO_VISIT);
      fields.resetTo(zonedNowParts(timezone).date, "09:00", "17:00");
      setWithBreak(false);
    }
  }

  const shift = fields.range;
  const brk =
    shift && withBreak && breakStart && breakEnd
      ? (() => {
          const from = instantAtOrAfter(date, breakStart, timezone, shift.from);
          const to = instantAtOrAfter(date, breakEnd, timezone, new Date(from.getTime() + 60_000));
          return { from, to };
        })()
      : null;
  const shiftHours = shift ? hoursBetween(shift.from, shift.to) : 0;
  const breakHours = brk ? hoursBetween(brk.from, brk.to) : 0;
  const breakInside = !brk || !shift || (brk.from > shift.from && brk.to < shift.to);

  function submit(addAnother: boolean) {
    if (!userId || !shift) {
      toast.error(fields.endBeforeStart ? "The end has to be after the start" : "Pick a person, and start and end dates and times");
      return;
    }
    if (withBreak && (!brk || !breakInside)) {
      toast.error("The break has to fall inside the shift");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createManualTimeEntry({
          userId,
          clockIn: shift.from.toISOString(),
          clockOut: shift.to.toISOString(),
          careRecipientId: visitId === NO_VISIT ? undefined : visitId,
          breakStart: brk?.from.toISOString(),
          breakEnd: brk?.to.toISOString(),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(`Added ${formatDuration(shiftHours - breakHours)} for ${users.find((u) => u.id === userId)?.name ?? "them"}`);
        onAdded?.();
        // Keep the person and date for the next missed punch; just move on.
        if (!addAnother) setOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't add the time — try again"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add time
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add time</DialogTitle>
          <DialogDescription>For a shift someone forgot to clock. For an overnight shift, set the end date to the next day.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Person</Label>
            <SearchableSelect
              items={Object.fromEntries(users.map((u) => [u.id, u.name]))}
              value={userId || null}
              onValueChange={(v) => setUserId(v ?? "")}
              placeholder="Select a person"
              searchPlaceholder="Search people..."
            />
          </div>
          {recipients.length > 0 && (
            <div className="space-y-1">
              <Label>Visit (optional)</Label>
              <SearchableSelect
                items={{ [NO_VISIT]: "Not a visit", ...Object.fromEntries(recipients.map((r) => [r.id, r.name])) }}
                value={visitId}
                onValueChange={(v) => setVisitId(v ?? NO_VISIT)}
                searchPlaceholder="Search recipients..."
              />
            </div>
          )}
          <StartEndFields idPrefix="add" startLabel="Start" endLabel="End" fields={fields} />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withBreak} onCheckedChange={(c) => setWithBreak(c === true)} />
            Unpaid break during this shift
          </label>
          {withBreak && (
            <div className="flex gap-3 rounded-lg bg-muted/40 p-3">
              <TimeInput id="add-break-start" label="Break start" value={breakStart} onChange={setBreakStart} day={dayOf(date, brk?.from, timezone)} />
              <TimeInput id="add-break-end" label="Break end" value={breakEnd} onChange={setBreakEnd} day={dayOf(date, brk?.to, timezone)} />
            </div>
          )}

          {shift && (
            <p className={`text-sm ${breakInside ? "" : "text-destructive"}`}>
              {!breakInside
                ? "The break has to fall inside the shift."
                : brk
                  ? `${formatDuration(shiftHours)} shift − ${formatDuration(breakHours)} break = ${formatDuration(shiftHours - breakHours)} paid`
                  : `${formatDuration(shiftHours)} paid`}
            </p>
          )}
          <TimezoneNote timeZone={timezone} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => submit(true)} loading={isPending}>
            Save and add another
          </Button>
          <Button onClick={() => submit(false)} loading={isPending}>
            Add time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
