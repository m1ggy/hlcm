"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { linkedTaskContextAction, startWorkTimerAction, stopWorkTimerAction } from "@/lib/actions/work";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { isOverdue, projectColorClass, type WorkScope, type WorkTaskPriority, type WorkTaskStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PriorityLabel, WorkStatusPill, formatDay } from "./work-status";
import { TaskCheck } from "./task-update-dialog";
import { TaskSheet, type LinkedTaskWorkspace } from "./task-sheet";

// Client work in the home workspace (docs/workspace-tasks-plan.md, Phase 5):
// the person's open tasks in every client workspace they're assigned to.
// Each row ticks off, times and opens the task right here — the panel and
// the timer act in the task's own workspace as the person's linked account.

export type ClientWorkTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  clientVisible: boolean;
  project: { id: string; name: string; color: string; clientVisible: boolean };
  parent: { title: string } | null;
};

export type ClientWorkGroup = { workspace: LinkedTaskWorkspace; tasks: ClientWorkTask[] };

type PanelContext = { scope: WorkScope; currentUserId: string; people: { id: string; name: string }[] };

export function ClientWorkList({
  groups,
  today,
  runningTimer,
}: {
  groups: ClientWorkGroup[];
  today: string;
  /** The task whose timer is running, if it's one of these. */
  runningTimer: { orgId: string; workTaskId: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ workspace: LinkedTaskWorkspace; taskId: string; context: PanelContext } | null>(null);
  const [timerBusy, startTimer] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function openTask(workspace: LinkedTaskWorkspace, taskId: string) {
    setOpeningId(taskId);
    try {
      const r = await linkedTaskContextAction(workspace.orgId);
      if (!r.ok) return void toast.error(r.error);
      setOpen({ workspace, taskId, context: r.data });
    } catch (error) {
      toast.error(unexpectedErrorMessage(error, "Couldn't open that task"));
    } finally {
      setOpeningId(null);
    }
  }

  function toggleTimer(orgId: string, taskId: string, running: boolean) {
    startTimer(async () => {
      try {
        const r = running ? await stopWorkTimerAction() : await startWorkTimerAction(taskId, orgId);
        if (!r.ok) return void toast.error(r.error);
        if (running) toast.success("Timer stopped");
        else toast.success(r.data && "clockedIn" in r.data && r.data.clockedIn ? "Timer started. You're clocked in." : "Timer started");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't change the timer"));
      }
    });
  }

  const onSheetOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setOpen(null);
        router.refresh();
      }
    },
    [router]
  );

  return (
    <>
      {groups.map((g) => (
        <section key={g.workspace.slug} className="space-y-2">
          <h2 className="text-sm font-semibold">
            {g.workspace.name} <span className="font-normal text-muted-foreground">· {g.tasks.length}</span>
          </h2>
          {g.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing open.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {g.tasks.map((t) => {
                const overdue = isOverdue({ status: t.status as WorkTaskStatus, dueDate: t.dueDate }, today);
                const running = runningTimer?.orgId === g.workspace.orgId && runningTimer.workTaskId === t.id;
                return (
                  <li key={t.id} className={cn("flex items-center hover:bg-muted/60", running && "bg-blue-500/5")}>
                    <TaskCheck
                      className="ml-4"
                      orgId={g.workspace.orgId}
                      task={{ id: t.id, title: t.title, status: t.status, clientCanSee: t.clientVisible && t.project.clientVisible }}
                    />
                    <button
                      type="button"
                      disabled={openingId === t.id}
                      onClick={() => openTask(g.workspace, t.id)}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-3 gap-y-1 px-4 py-3 text-left disabled:opacity-60"
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", projectColorClass(t.project.color))} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t.project.name}
                          {t.parent && ` / ${t.parent.title}`}
                        </span>
                      </span>
                      <PriorityLabel priority={t.priority as WorkTaskPriority} />
                      <WorkStatusPill status={t.status as WorkTaskStatus} />
                      <span className={cn("w-28 text-right text-xs tabular-nums", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {t.dueDate ? (overdue ? `Overdue · ${formatDay(t.dueDate)}` : formatDay(t.dueDate)) : "No due date"}
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant={running ? "default" : "ghost"}
                      className="mr-3"
                      disabled={timerBusy}
                      aria-label={running ? `Stop the timer on ${t.title}` : `Start a timer on ${t.title}`}
                      onClick={() => toggleTimer(g.workspace.orgId, t.id, running)}
                    >
                      {running ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
                      {running ? "Stop" : "Start"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
      {open && (
        <TaskSheet
          taskId={open.taskId}
          onOpenChange={onSheetOpenChange}
          onOpenTask={(id) => setOpen((o) => (o ? { ...o, taskId: id } : o))}
          scope={open.context.scope}
          currentUserId={open.context.currentUserId}
          people={open.context.people}
          workspace={open.workspace}
        />
      )}
    </>
  );
}
