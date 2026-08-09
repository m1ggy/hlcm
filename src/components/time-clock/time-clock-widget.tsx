"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clockIn, clockOut } from "@/lib/actions/time-entries";
import { formatDuration } from "@/lib/time-entries";

export function TimeClockWidget({ initialClockIn }: { initialClockIn: string | null }) {
  // Server passes the open entry's clockIn as an ISO string (Dates aren't
  // serializable across the server/client boundary); null means clocked out.
  const [clockedInAt, setClockedInAt] = useState(initialClockIn ? new Date(initialClockIn) : null);
  const [elapsedHours, setElapsedHours] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!clockedInAt) return;
    // `Date.now()` is impure, so it can't run directly in the effect body
    // (or during render) — schedule it via setTimeout/setInterval callbacks
    // instead, same pattern as the tour's pending-navigation fix.
    const tick = () => setElapsedHours((Date.now() - clockedInAt.getTime()) / 3_600_000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [clockedInAt]);

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

  if (clockedInAt) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClockOut}
        disabled={isPending}
        data-tour="time-clock"
        className="border-green-600/40 text-green-700 dark:text-green-400"
      >
        <LogOut className="size-3.5" /> Clock out · {formatDuration(elapsedHours)}
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClockIn} disabled={isPending} data-tour="time-clock">
      <Clock className="size-3.5" /> Clock in
    </Button>
  );
}
