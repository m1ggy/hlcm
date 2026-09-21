"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startTaskTimer, stopTaskTimer, setOpenTaskTimerDescription } from "@/lib/actions/task-time-entries";
import { formatDuration } from "@/lib/time-entries";

type RecentTask = { id: string; label: string; applicationName: string | null };

/**
 * The Time tracking page's own view of *your* timer: when one's running,
 * what it is, how long, with a note field and Stop; when idle, a one-click
 * "Quick start" row of the tasks you tracked most recently. Same server
 * actions as the nav widget — the page passes `key={open timer id}` so a
 * start/stop from either place remounts the other with fresh server state.
 */
export function TaskTimerBar({
  running,
  recentTasks,
}: {
  running: { taskLabel: string | null; startedAt: string; description: string | null } | null;
  recentTasks: RecentTask[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState(running?.description ?? "");
  const [elapsedHours, setElapsedHours] = useState(0);
  const startedAt = running ? new Date(running.startedAt) : null;
  const startedAtMs = startedAt?.getTime() ?? null;

  useEffect(() => {
    if (startedAtMs === null) return;
    const tick = () => setElapsedHours((Date.now() - startedAtMs) / 3_600_000);
    const timeoutId = setTimeout(tick, 0);
    const intervalId = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [startedAtMs]);

  function start(taskId?: string) {
    startTransition(async () => {
      try {
        const entry = await startTaskTimer({ taskId });
        toast.success(`Timer started${entry.task ? ` — ${entry.task.label}` : ""}`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to start timer");
      }
    });
  }

  function stop() {
    startTransition(async () => {
      try {
        await stopTaskTimer();
        toast.success("Timer stopped");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to stop timer");
      }
    });
  }

  function saveNote() {
    if (note.trim() === (running?.description ?? "")) return;
    startTransition(async () => {
      try {
        await setOpenTaskTimerDescription(note);
        toast.success("Note saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save note");
      }
    });
  }

  if (running) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-500/40 bg-blue-500/5 px-4 py-3">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-blue-600" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            You&apos;re tracking: {running.taskLabel ?? "Internal / no task"}
          </p>
          <p className="text-xs text-muted-foreground">Running for {formatDuration(elapsedHours)}</p>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="What are you working on? (optional note)"
          className="h-8 min-w-48 flex-1"
        />
        <Button variant="outline" size="sm" onClick={stop} loading={isPending}>
          <Square className="size-3.5" /> Stop
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3">
      <span className="text-sm font-medium">Quick start</span>
      {recentTasks.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Pick a task in the top bar and press Start — the tasks you track show up here for one-click restarts.
        </span>
      ) : (
        recentTasks.map((t) => (
          <Button
            key={t.id}
            variant="outline"
            size="sm"
            className="max-w-56"
            disabled={isPending}
            onClick={() => start(t.id)}
            title={t.applicationName ? `${t.label} · ${t.applicationName}` : t.label}
          >
            <Play className="size-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </Button>
        ))
      )}
      <Button variant="ghost" size="sm" disabled={isPending} onClick={() => start()}>
        No task
      </Button>
    </div>
  );
}
