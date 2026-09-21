"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addManualTaskTimeEntry } from "@/lib/actions/task-time-entries";
import { effectiveTimezone, zonedInputToISOString } from "@/lib/time-entries";
import { parseDurationInput, formatDayLabel, formatTrackedDuration } from "@/lib/task-time-entries";

/**
 * Click a weekly-grid cell → this: the task and day are already known, so
 * it only asks for a duration (and an optional note). Same "Date + Duration"
 * model as AddTaskTimeDialog's default mode — the block is anchored at 9:00
 * that day, since only the date and length matter downstream. `userId` is
 * set when a manager is viewing (and so logging for) a teammate's week.
 */
export function QuickLogDialog({
  target,
  userId,
  accountTimezone,
  onClose,
  onLogged,
}: {
  /** null = closed. */
  target: { taskId: string | null; taskLabel: string; day: string } | null;
  userId: string | null;
  accountTimezone: string | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const hours = parseDurationInput(duration);

  function close() {
    setDuration("");
    setNote("");
    onClose();
  }

  function submit() {
    if (!target) return;
    if (hours == null) {
      toast.error("Enter a duration like 1h 30m");
      return;
    }
    const startISO = zonedInputToISOString(`${target.day}T09:00`, timezone);
    const endISO = new Date(new Date(startISO).getTime() + hours * 3_600_000).toISOString();
    startTransition(async () => {
      try {
        await addManualTaskTimeEntry({
          userId: userId ?? undefined,
          taskId: target.taskId ?? undefined,
          startedAt: startISO,
          endedAt: endISO,
          description: note || undefined,
          billable: true,
        });
        toast.success(`Logged ${formatTrackedDuration(hours)}`);
        close();
        onLogged();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to log time");
      }
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {target?.taskLabel ?? ""}
            <span className="block text-sm font-normal text-muted-foreground">
              {target ? formatDayLabel(target.day) : ""}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="quick-duration">Duration</Label>
            <Input
              id="quick-duration"
              autoFocus
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 1h 30m"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <p className="text-xs text-muted-foreground">
              {duration.trim() === ""
                ? "Try 1h 30m, 45m, 1.5 or 1:30."
                : hours == null
                  ? "Couldn't read that — try 1h 30m, 45m, 1.5 or 1:30."
                  : `= ${formatTrackedDuration(hours)}`}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quick-note">Note (optional)</Label>
            <Input
              id="quick-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          <Button onClick={submit} loading={isPending} className="w-full">
            Log time
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
