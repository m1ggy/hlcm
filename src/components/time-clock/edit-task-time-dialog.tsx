"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateTaskTimeEntry } from "@/lib/actions/task-time-entries";
import { listTaskOptionsForUser } from "@/lib/actions/tasks";
import { effectiveTimezone, zonedInputToISOString, toDatetimeLocalValue, timezoneLabel } from "@/lib/time-entries";

type TaskOption = { id: string; label: string; applicationName: string | null };

/**
 * Corrects an existing manual/stopped entry — own always editable (until
 * billed, enforced server-side), anyone else's requires ADMIN/MANAGER, same
 * ownership rule as EditTimeEntryDialog for the attendance clock. Only
 * shown for entries with an endedAt (a still-running timer isn't "edited"
 * here, it's stopped from the nav widget).
 */
export function EditTaskTimeDialog({
  entry,
  tasks,
  accountTimezone,
  onUpdated,
}: {
  entry: {
    id: string;
    userId: string;
    taskId: string | null;
    task: { label: string } | null;
    startedAt: Date;
    endedAt: Date;
    description: string | null;
    billable: boolean;
  };
  tasks: TaskOption[];
  accountTimezone: string | null;
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(entry.taskId);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [description, setDescription] = useState(entry.description ?? "");
  const [billable, setBillable] = useState(entry.billable);
  const [isPending, startTransition] = useTransition();
  const timezone = effectiveTimezone(accountTimezone);
  // Starts as the caller's own list; on open it's swapped for the entry
  // owner's tasks (this may be a teammate's entry a manager is correcting),
  // always including the entry's current task so it never shows blank.
  const [options, setOptions] = useState<TaskOption[]>(tasks);

  const taskItems = Object.fromEntries(
    options.map((t) => [t.id, t.applicationName ? `${t.label} · ${t.applicationName}` : t.label])
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      listTaskOptionsForUser(entry.userId)
        .then((owned) => {
          const currentId = entry.taskId;
          const missingCurrent = currentId !== null && !owned.some((t) => t.id === currentId);
          setOptions(
            missingCurrent
              ? [{ id: currentId, label: entry.task?.label ?? "Current task", applicationName: null }, ...owned]
              : owned
          );
        })
        .catch(() => {
          // Keep whatever list we already have — editing still works.
        });
      setTaskId(entry.taskId);
      setStartedAt(toDatetimeLocalValue(entry.startedAt, timezone));
      setEndedAt(toDatetimeLocalValue(entry.endedAt, timezone));
      setDescription(entry.description ?? "");
      setBillable(entry.billable);
    }
  }

  function handleSubmit() {
    if (!startedAt || !endedAt) {
      toast.error("Fill in a start and end time");
      return;
    }
    startTransition(async () => {
      try {
        await updateTaskTimeEntry(entry.id, {
          taskId,
          startedAt: zonedInputToISOString(startedAt, timezone),
          endedAt: zonedInputToISOString(endedAt, timezone),
          description: description || undefined,
          billable,
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
            <Label>Task</Label>
            <SearchableSelect
              items={taskItems}
              value={taskId}
              onValueChange={setTaskId}
              placeholder="No task (internal)"
              searchPlaceholder="Search tasks..."
            />
          </div>
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
              <a href="/account" className="underline">Change it</a>.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(c) => setBillable(c === true)} />
            Billable
          </label>
          <Button onClick={handleSubmit} loading={isPending} className="w-full">
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
