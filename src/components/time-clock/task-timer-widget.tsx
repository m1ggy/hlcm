"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Play, Square, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { startTaskTimer, stopTaskTimer, setOpenTaskTimerDescription } from "@/lib/actions/task-time-entries";
import { formatDuration } from "@/lib/time-entries";

type TaskOption = { id: string; label: string; applicationName: string | null };

/**
 * Everhour-style "what are you working on" timer — separate from
 * TimeClockWidget (the attendance shift clock) alongside it in the nav:
 * a person can be clocked in for the day and running/not-running a task
 * timer independently, same as Everhour's own desktop timer vs. an
 * attendance system. Only one task timer runs at a time (see
 * startTaskTimer), so picking a new task while one's running just swaps it.
 *
 * Start is meant to be one click: the picker defaults to the task you
 * tracked most recently (and lists recents first), and stays on that task
 * after Stop so "resume" is just Start again. The dashboard layout keys
 * this component on the open timer's id, so a start/stop made elsewhere
 * (the Time tracking page's bar) remounts it with fresh server truth.
 */
export function TaskTimerWidget({
  initialTaskId,
  initialTaskLabel,
  initialStartedAt,
  initialDescription,
  tasks,
  recentTaskIds,
}: {
  /** The caller's currently-open TaskTimeEntry, if any — null taskId with a
   * set initialStartedAt means running against "Internal / no task". */
  initialTaskId: string | null;
  initialTaskLabel: string | null;
  initialStartedAt: string | null;
  initialDescription: string | null;
  tasks: TaskOption[];
  /** Most-recently-tracked task ids, newest first. */
  recentTaskIds: string[];
}) {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(initialTaskId);
  const [runningLabel, setRunningLabel] = useState<string | null>(initialTaskLabel);
  const [startedAt, setStartedAt] = useState<Date | null>(initialStartedAt ? new Date(initialStartedAt) : null);
  const [note, setNote] = useState(initialDescription ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [pickedTaskId, setPickedTaskId] = useState<string | null>(() => {
    const last = recentTaskIds[0];
    return last && tasks.some((t) => t.id === last) ? last : null;
  });
  const [elapsedHours, setElapsedHours] = useState(0);
  const [isPending, startTransition] = useTransition();

  const isRunning = startedAt !== null;

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsedHours((Date.now() - startedAt.getTime()) / 3_600_000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [startedAt]);

  // Recents first, then the rest — object key order is insertion order for
  // non-integer keys (task ids are cuids), which SearchableSelect preserves.
  const recentSet = new Set(recentTaskIds);
  const ordered = [
    ...recentTaskIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is TaskOption => !!t),
    ...tasks.filter((t) => !recentSet.has(t.id)),
  ];
  const taskItems = Object.fromEntries(
    ordered.map((t) => [t.id, t.applicationName ? `${t.label} · ${t.applicationName}` : t.label])
  );

  function handleStart() {
    startTransition(async () => {
      try {
        const entry = await startTaskTimer({ taskId: pickedTaskId ?? undefined });
        setRunningTaskId(entry.taskId);
        setRunningLabel(entry.task?.label ?? "Internal / no task");
        setStartedAt(new Date(entry.startedAt));
        setNote("");
        toast.success(`Timer started${entry.task ? ` — ${entry.task.label}` : ""}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to start timer");
      }
    });
  }

  function handleStop() {
    startTransition(async () => {
      try {
        await stopTaskTimer();
        // Keep the task selected — "resume" is just Start again.
        setPickedTaskId(runningTaskId);
        setRunningTaskId(null);
        setRunningLabel(null);
        setStartedAt(null);
        setNote("");
        setEditingNote(false);
        toast.success("Timer stopped");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to stop timer");
      }
    });
  }

  function saveNote() {
    setEditingNote(false);
    startTransition(async () => {
      try {
        await setOpenTaskTimerDescription(note);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save note");
      }
    });
  }

  if (isRunning) {
    return (
      <div className="flex items-center gap-1">
        {editingNote ? (
          <Input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNote();
              if (e.key === "Escape") setEditingNote(false);
            }}
            placeholder="What are you working on?"
            className="h-7 w-52 text-xs"
          />
        ) : (
          <span
            className="max-w-48 truncate rounded-md border border-blue-500/40 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400"
            title={note ? `${runningLabel ?? "Internal / no task"} — ${note}` : undefined}
          >
            {runningLabel ?? "Internal / no task"} · {formatDuration(elapsedHours)}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={note ? `Note: ${note}` : "Add a note"}
          onClick={() => setEditingNote(true)}
        >
          <StickyNote className={`size-3.5 ${note ? "text-blue-600" : ""}`} />
        </Button>
        <Button variant="outline" size="sm" onClick={handleStop} loading={isPending}>
          <Square className="size-3.5" /> Stop
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <SearchableSelect
        items={taskItems}
        value={pickedTaskId}
        onValueChange={setPickedTaskId}
        placeholder="No task (internal)"
        searchPlaceholder="Search your tasks..."
        className="flex h-7 w-44 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2 text-xs whitespace-nowrap transition-colors outline-none select-none data-placeholder:text-muted-foreground"
      />
      <Button variant="default" size="sm" onClick={handleStart} loading={isPending}>
        <Play className="size-3.5" /> Start
      </Button>
    </div>
  );
}
