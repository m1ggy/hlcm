"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, Coffee, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clockIn, clockOut, startBreak, endBreak, endBreakForDay } from "@/lib/actions/time-entries";
import { formatDuration } from "@/lib/time-entries";

export function TimeClockWidget({
  initialClockIn,
  initialBreakStart,
}: {
  initialClockIn: string | null;
  /** Server passes the open BreakEntry's breakStart as an ISO string, same
   * as initialClockIn — null means not currently on a break. */
  initialBreakStart: string | null;
}) {
  const [clockedInAt, setClockedInAt] = useState(initialClockIn ? new Date(initialClockIn) : null);
  const [breakStartedAt, setBreakStartedAt] = useState(initialBreakStart ? new Date(initialBreakStart) : null);
  const [elapsedHours, setElapsedHours] = useState(0);
  const [isPending, startTransition] = useTransition();

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

  function handleClockIn() {
    startTransition(async () => {
      try {
        const entry = await clockIn();
        setClockedInAt(new Date(entry.clockIn));
        toast.success("Clocked in");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to clock in");
      }
    });
  }

  function handleClockOut() {
    startTransition(async () => {
      try {
        await clockOut();
        setClockedInAt(null);
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

  if (breakStartedAt) {
    return (
      <div className="flex items-center gap-1" data-tour="time-clock">
        <span className="rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          On break · {formatDuration(elapsedHours)}
        </span>
        <Button variant="outline" size="sm" onClick={handleEndBreak} disabled={isPending}>
          <Clock className="size-3.5" /> End break
        </Button>
        <Button variant="ghost" size="sm" onClick={handleEndBreakForDay} disabled={isPending}>
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
          disabled={isPending}
          className="border-green-600/40 text-green-700 dark:text-green-400"
        >
          <LogOut className="size-3.5" /> Clock out · {formatDuration(elapsedHours)}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleStartBreak} disabled={isPending}>
          <Coffee className="size-3.5" /> Break
        </Button>
      </div>
    );
  }

  return (
    <Button variant="default" size="sm" onClick={handleClockIn} disabled={isPending} data-tour="time-clock">
      <Clock className="size-3.5" /> {isPending ? "Clocking in..." : "Clock in"}
    </Button>
  );
}
