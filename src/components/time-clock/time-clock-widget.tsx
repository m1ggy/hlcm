"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Coffee, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clockIn, clockOut, startBreak, endBreak, endBreakForDay } from "@/lib/actions/time-entries";
import { formatDuration } from "@/lib/time-entries";
import { captureLocation } from "@/lib/geolocation";

type CareRecipient = { id: string; name: string };

export function TimeClockWidget({
  initialClockIn,
  initialBreakStart,
  initialCareRecipientId = null,
  isCaregiver = false,
  careRecipients = [],
}: {
  initialClockIn: string | null;
  /** Server passes the open BreakEntry's breakStart as an ISO string, same
   * as initialClockIn — null means not currently on a break. */
  initialBreakStart: string | null;
  /** The open TimeEntry's careRecipientId, if any — lets a page reload
   * mid-shift still know whether clock-out should capture location. */
  initialCareRecipientId?: string | null;
  /** Caregiver-only: whether to prompt for a recipient + capture GPS on
   * clock-in/out at all. Every other role's flow below is byte-for-byte
   * what it was before this prop existed. */
  isCaregiver?: boolean;
  /** This Caregiver's assigned recipients — 0 skips the picker entirely
   * (office work, clocks in same as any other role), 1 auto-selects, 2+
   * prompts. See src/lib/actions/care-recipients.ts#listMyCareRecipients. */
  careRecipients?: CareRecipient[];
}) {
  const [clockedInAt, setClockedInAt] = useState(initialClockIn ? new Date(initialClockIn) : null);
  const [breakStartedAt, setBreakStartedAt] = useState(initialBreakStart ? new Date(initialBreakStart) : null);
  const [elapsedHours, setElapsedHours] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Only set while an actual visit is open (a recipient was picked/
  // auto-selected at clock-in) — office work (no recipient) leaves this
  // null, so clock-out for that session skips the geo prompt too, matching
  // clock-in's own "no recipient, no prompt" rule.
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(initialCareRecipientId);

  // Starting a break closes the open TimeEntry, so clockedInAt goes back to
  // null while on break — this picks whichever of the two is the "live"
  // anchor right now, so the same ticker drives both a work session's and a
  // break's elapsed-time display.
  const anchor = breakStartedAt ?? clockedInAt;

  useEffect(() => {
    if (!anchor) return;
    // `Date.now()` is impure, so it can't run directly in the effect body
    // (or during render) — schedule it via setTimeout/setInterval callbacks
    // instead, same pattern as the tour's pending-navigation fix.
    const tick = () => setElapsedHours((Date.now() - anchor.getTime()) / 3_600_000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [anchor]);

  function doClockIn(careRecipientId?: string) {
    startTransition(async () => {
      try {
        // Only an actual visit (a recipient was picked/auto-selected)
        // prompts for location — a Caregiver clocking in for plain office
        // work behaves exactly like any other role, no geo prompt at all.
        const location = isCaregiver && careRecipientId ? await captureLocation() : {};
        const entry = await clockIn({ careRecipientId, ...location });
        setClockedInAt(new Date(entry.clockIn));
        setActiveRecipientId(careRecipientId ?? null);
        toast.success("Clocked in");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to clock in");
      }
    });
  }

  function handleClockIn() {
    // Non-Caregivers, and a Caregiver with no assignments (pure office
    // work), clock in exactly as before — no picker, no geo prompt.
    if (!isCaregiver || careRecipients.length === 0) {
      doClockIn();
      return;
    }
    if (careRecipients.length === 1) {
      doClockIn(careRecipients[0].id);
      return;
    }
    setPickerOpen(true);
  }

  function handlePickRecipient(id: string) {
    setPickerOpen(false);
    doClockIn(id);
  }

  function handleClockOut() {
    startTransition(async () => {
      try {
        const location = isCaregiver && activeRecipientId ? await captureLocation() : {};
        await clockOut(location);
        setClockedInAt(null);
        setActiveRecipientId(null);
        toast.success("Clocked out");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to clock out");
      }
    });
  }

  function handleStartBreak() {
    startTransition(async () => {
      try {
        const entry = await startBreak();
        setClockedInAt(null);
        setBreakStartedAt(new Date(entry.breakStart));
        toast.success("Break started");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to start break");
      }
    });
  }

  function handleEndBreak() {
    startTransition(async () => {
      try {
        const entry = await endBreak();
        setBreakStartedAt(null);
        setClockedInAt(new Date(entry.clockIn));
        toast.success("Break ended");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to end break");
      }
    });
  }

  function handleEndBreakForDay() {
    startTransition(async () => {
      try {
        await endBreakForDay();
        setBreakStartedAt(null);
        toast.success("Clocked out for the day");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to end break");
      }
    });
  }

  const picker = isCaregiver && careRecipients.length > 1 && (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who&apos;s this visit for?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {careRecipients.map((recipient) => (
            <Button
              key={recipient.id}
              variant="outline"
              className="justify-start"
              onClick={() => handlePickRecipient(recipient.id)}
            >
              <MapPin className="size-3.5" /> {recipient.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  if (breakStartedAt) {
    return (
      <div className="flex items-center gap-1" data-tour="time-clock">
        <span className="rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          On break · {formatDuration(elapsedHours)}
        </span>
        <Button variant="outline" size="sm" onClick={handleEndBreak} loading={isPending}>
          <Clock className="size-3.5" /> End break
        </Button>
        <Button variant="ghost" size="sm" onClick={handleEndBreakForDay} loading={isPending}>
          <LogOut className="size-3.5" /> End day
        </Button>
      </div>
    );
  }

  if (clockedInAt) {
    return (
      <div className="flex items-center gap-1" data-tour="time-clock">
        <Button
          variant="outline"
          size="sm"
          onClick={handleClockOut}
          loading={isPending}
          className="border-green-600/40 text-green-700 dark:text-green-400"
        >
          <LogOut className="size-3.5" /> Clock out · {formatDuration(elapsedHours)}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleStartBreak} loading={isPending}>
          <Coffee className="size-3.5" /> Break
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="default" size="sm" onClick={handleClockIn} loading={isPending} data-tour="time-clock">
        <Clock className="size-3.5" /> {isPending ? "Clocking in..." : "Clock in"}
      </Button>
      {picker}
    </>
  );
}
