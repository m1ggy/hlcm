"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { addManualTaskTimeEntry } from "@/lib/actions/task-time-entries";
import { listTaskOptionsForUser } from "@/lib/actions/tasks";
import { Input } from "@/components/ui/input";
import { effectiveTimezone, zonedInputToISOString, zonedNowParts, timezoneLabel } from "@/lib/time-entries";
import { parseDurationInput, formatTrackedDuration } from "@/lib/task-time-entries";

type TaskOption = { id: string; label: string; applicationName: string | null };

/**
 * Self-service manual log — unlike AddTimeEntryDialog (the attendance
 * clock's admin-only backfill), any signed-in user can log their own past
 * work here, same as Everhour's own manual-entry model. `users` is only
 * passed (and the picker shown) for an ADMIN/MANAGER logging on someone
 * else's behalf; omitted, it always logs to the caller.
 */
export function AddTaskTimeDialog({
  tasks,
  users,
  accountTimezone,
  onAdded,
  fixedTaskId,
  triggerLabel = "Log time",
}: {
  tasks: TaskOption[];
  users?: { id: string; name: string }[];
  accountTimezone: string | null;
  onAdded?: () => void;
  /** Locks the entry to one task and hides the picker — used from
   * TaskDetailDialog's own "Log time" action, where the task is already
   * known and re-picking it would be redundant. */
  fixedTaskId?: string;
  triggerLabel?: string;
}) {
  const timezone = effectiveTimezone(accountTimezone);
  const [open, setOpen] = useState(false);
  // Most people log "2h on Tuesday", not exact clock times — so the default
  // is Date + Duration, with "Use start & end times" for when it matters.
  const [mode, setMode] = useState<"duration" | "range">("duration");
  const [day, setDay] = useState(() => zonedNowParts(timezone).date);
  const [duration, setDuration] = useState("");
  const [userId, setUserId] = useState("");
  // When logging on someone else's behalf, the picker lists *their* tasks.
  const [userTasks, setUserTasks] = useState<TaskOption[] | null>(null);
  const [taskId, setTaskId] = useState<string | null>(fixedTaskId ?? null);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [isPending, startTransition] = useTransition();

  const taskItems = Object.fromEntries(
    (userTasks ?? tasks).map((t) => [t.id, t.applicationName ? `${t.label} · ${t.applicationName}` : t.label])
  );

  function pickUser(next: string) {
    setUserId(next);
    setTaskId(fixedTaskId ?? null); // the previous person's task isn't theirs
    if (!next) {
      setUserTasks(null);
      return;
    }
    listTaskOptionsForUser(next)
      .then(setUserTasks)
      .catch(() => setUserTasks(null));
  }

  function reset() {
    setUserTasks(null);
    setUserId("");
    setTaskId(fixedTaskId ?? null);
    setStartedAt("");
    setEndedAt("");
    setDescription("");
    setBillable(true);
    setMode("duration");
    setDay(zonedNowParts(timezone).date);
    setDuration("");
  }

  const parsedHours = parseDurationInput(duration);

  function handleSubmit() {
    let startISO: string;
    let endISO: string;
    if (mode === "duration") {
      if (!day || parsedHours == null) {
        toast.error("Enter a date and a duration like 1h 30m");
        return;
      }
      // No clock time was given — anchor the block at 9:00 that day; only
      // the date and the length matter for the grid/report/billing.
      startISO = zonedInputToISOString(`${day}T09:00`, timezone);
      endISO = new Date(new Date(startISO).getTime() + parsedHours * 3_600_000).toISOString();
    } else {
      if (!startedAt || !endedAt) {
        toast.error("Fill in a start and end time");
        return;
      }
      startISO = zonedInputToISOString(startedAt, timezone);
      endISO = zonedInputToISOString(endedAt, timezone);
    }
    startTransition(async () => {
      try {
        await addManualTaskTimeEntry({
          userId: userId || undefined,
          taskId: taskId || undefined,
          startedAt: startISO,
          endedAt: endISO,
          description: description || undefined,
          billable,
        });
        toast.success("Time logged");
        setOpen(false);
        reset();
        onAdded?.();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to log time");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {users && (
            <div className="space-y-1">
              <Label>User</Label>
              <SearchableSelect
                items={Object.fromEntries(users.map((u) => [u.id, u.name]))}
                value={userId || null}
                onValueChange={(v) => pickUser(v ?? "")}
                placeholder="Yourself"
                searchPlaceholder="Search users..."
              />
            </div>
          )}
          {!fixedTaskId && (
            <div className="space-y-1">
              <Label>Task</Label>
              <SearchableSelect
                items={taskItems}
                value={taskId}
                onValueChange={setTaskId}
                placeholder="No task (internal)"
                searchPlaceholder="Search tasks..."
              />
            </div>
          )}
          {mode === "duration" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="log-day">Date</Label>
                  <Input id="log-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log-duration">Duration</Label>
                  <Input
                    id="log-duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 1h 30m"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {duration.trim() === ""
                  ? "Try 1h 30m, 45m, 1.5 or 1:30."
                  : parsedHours == null
                    ? "Couldn't read that — try 1h 30m, 45m, 1.5 or 1:30."
                    : `= ${formatTrackedDuration(parsedHours)}`}{" "}
                <button type="button" className="underline" onClick={() => setMode("range")}>
                  Use start &amp; end times instead
                </button>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <DateTimeInput value={startedAt} onChange={setStartedAt} timeZone={timezone} clearable={false} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <DateTimeInput value={endedAt} onChange={setEndedAt} timeZone={timezone} clearable={false} />
              </div>
              <p className="text-xs text-muted-foreground">
                Times are read in your timezone — {timezoneLabel(timezone)}.{" "}
                <a href="/account" className="underline">Change it</a>.{" "}
                <button type="button" className="underline" onClick={() => setMode("duration")}>
                  Enter a duration instead
                </button>
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you work on?" rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(c) => setBillable(c === true)} />
            Billable
          </label>
          <Button onClick={handleSubmit} loading={isPending} className="w-full">
            Log entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
