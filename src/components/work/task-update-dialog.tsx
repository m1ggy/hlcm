"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clientWorkUpdateDefaultsAction, postClientWorkUpdateAction, postTaskUpdateAction, taskUpdateDefaultsAction, updateTaskAction } from "@/lib/actions/work";
import { completeTaskWithUpdate, licensingTaskUpdateDefaultsAction, updateTask as updateLicensingTask } from "@/lib/actions/tasks";
import { WORK_TASK_STATUSES, WORK_TASK_STATUS_LABELS, type WorkTaskStatus } from "@/lib/work";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusDot } from "./work-status";

// "What did you do?" (docs/task-updates-plan.md): written on the task, posted
// there, and added to the writer's end-of-day report. Opened by ticking a
// task's checkbox (finishes it) or by "Post update" in the task panel.

/**
 * The task: a Projects & tasks one here, one in a client workspace (orgId,
 * from the Client work page), or a licensing task (licensing: true).
 */
export type UpdateTarget = { taskId: string; orgId?: string; licensing?: boolean };

export function TaskUpdateDialog({
  open,
  onOpenChange,
  target,
  taskTitle,
  mode,
  clientCanSee,
  currentStatus,
  allowSkip = false,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: UpdateTarget;
  taskTitle: string;
  /** complete: the checkbox, marks it done. update: progress, status optional. */
  mode: "complete" | "update";
  /** The client can see this task, so the update can be shared with them. */
  clientCanSee: boolean;
  currentStatus: WorkTaskStatus;
  /** Subtasks: tick without writing anything. */
  allowSkip?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("");
  const [share, setShare] = useState(true);
  const [status, setStatus] = useState<WorkTaskStatus>(currentStatus);
  const [addsToReport, setAddsToReport] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = target.licensing
      ? licensingTaskUpdateDefaultsAction(target.taskId)
      : target.orgId
        ? clientWorkUpdateDefaultsAction(target.orgId, target.taskId)
        : taskUpdateDefaultsAction(target.taskId);
    load.then((r) => {
      if (cancelled || !r.ok) return;
      if (r.data.minutes) setMinutes((m) => m || String(r.data.minutes));
      setAddsToReport(r.data.addsToReport);
    });
    return () => {
      cancelled = true;
    };
  }, [open, target.licensing, target.orgId, target.taskId]);

  function close() {
    onOpenChange(false);
    setText("");
    setMinutes("");
    setShare(true);
    setStatus(currentStatus);
  }

  function finish(message: string) {
    toast.success(message);
    close();
    onDone?.();
    router.refresh();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return void toast.error("Say what you did");
    const mins = minutes.trim() ? Number(minutes) : null;
    if (mins !== null && (!Number.isFinite(mins) || mins < 0 || mins > 1440)) return void toast.error("Minutes must be between 0 and 1440");
    const input = { text, minutes: mins, shareWithClient: clientCanSee && share, complete: mode === "complete", status: mode === "update" ? status : null };
    startTransition(async () => {
      const r = target.licensing
        ? await completeTaskWithUpdate(target.taskId, input)
        : target.orgId
          ? await postClientWorkUpdateAction(target.orgId, target.taskId, input)
          : await postTaskUpdateAction(target.taskId, input);
      if (!r.ok) return void toast.error(r.error);
      const where = !r.data.addedToReport ? "" : r.data.afterSubmit ? " Added to today's report, which you'd already submitted." : " Added to today's end-of-day report.";
      finish(`${mode === "complete" ? "Marked done." : "Update posted."}${where}`);
    });
  }

  function skip() {
    startTransition(async () => {
      if (target.licensing) {
        const form = new FormData();
        form.set("status", "COMPLETED");
        try {
          await updateLicensingTask(target.taskId, form);
        } catch {
          return void toast.error("Couldn't mark it done");
        }
      } else {
        const r = await updateTaskAction(target.taskId, { status: "DONE" });
        if (!r.ok) return void toast.error(r.error);
      }
      finish("Marked done");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "complete" ? "What did you do?" : "Post an update"}</DialogTitle>
            <DialogDescription>
              {taskTitle}
              {addsToReport && <span className="block">This also goes on your end-of-day report for today.</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="update-text">{mode === "complete" ? "What you did to finish it" : "What you did"}</Label>
            <Textarea
              id="update-text"
              rows={4}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Called the county office and confirmed the inspection for Tuesday."
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="update-minutes">Minutes (optional)</Label>
              <Input id="update-minutes" type="number" inputMode="numeric" min={0} max={1440} className="w-32" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            {mode === "update" && (
              <div className="min-w-48 flex-1 space-y-1">
                <Label>Status</Label>
                <Select items={WORK_TASK_STATUS_LABELS} value={status} onValueChange={(v) => v && setStatus(v as WorkTaskStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        <StatusDot status={s} /> {WORK_TASK_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {clientCanSee && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={share} onCheckedChange={(v) => setShare(Boolean(v))} className="mt-0.5" />
              <span>
                Share with the client
                <span className="block text-xs text-muted-foreground">
                  {target.licensing ? "It shows on the application's progress page, if you've shared one." : "They see it on the task and in their daily summary."}
                </span>
              </span>
            </label>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {allowSkip ? (
              <Button type="button" variant="ghost" onClick={skip} disabled={isPending}>
                Skip, just mark it done
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {mode === "complete" ? "Mark done" : "Post update"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A task's checkbox in a list: ticking an open task asks what you did, then
 * marks it done; unticking a done one reopens it (here only).
 */
export function TaskCheck({
  task,
  orgId,
  licensing = false,
  className,
  onChanged,
  allowSkip = false,
}: {
  task: { id: string; title: string; status: string; clientCanSee: boolean; needsApproval?: boolean };
  orgId?: string;
  /** A licensing task: done is Completed, and unticking sets it back to Not started. */
  licensing?: boolean;
  className?: string;
  /** The new status after ticking or unticking, for rows that keep their own copy. */
  onChanged?: (status: string) => void;
  /** Subtasks: "What did you do?" can be skipped. */
  allowSkip?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const done = licensing ? task.status === "COMPLETED" : task.status === "DONE";
  const blocked = task.needsApproval || task.status === "CANCELLED" || (licensing && (task.status === "NA" || task.status === "CLOSED"));

  return (
    <>
      <Checkbox
        className={className}
        checked={done}
        disabled={blocked || isPending || (done && Boolean(orgId))}
        aria-label={done ? `Reopen "${task.title}"` : `Mark "${task.title}" done`}
        title={task.needsApproval ? "Accept the request first" : undefined}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onCheckedChange={(v) => {
          if (v) return setOpen(true);
          startTransition(async () => {
            if (licensing) {
              const form = new FormData();
              form.set("status", "NOT_STARTED");
              try {
                await updateLicensingTask(task.id, form);
              } catch {
                return void toast.error("Couldn't reopen the task");
              }
            } else {
              const r = await updateTaskAction(task.id, { status: "TODO" });
              if (!r.ok) return void toast.error(r.error);
            }
            toast.success("Reopened");
            onChanged?.(licensing ? "NOT_STARTED" : "TODO");
            router.refresh();
          });
        }}
      />
      <TaskUpdateDialog
        open={open}
        onOpenChange={setOpen}
        target={{ taskId: task.id, orgId, licensing }}
        onDone={() => onChanged?.(licensing ? "COMPLETED" : "DONE")}
        allowSkip={allowSkip}
        taskTitle={task.title}
        mode="complete"
        clientCanSee={task.clientCanSee}
        currentStatus={task.status as WorkTaskStatus}
      />
    </>
  );
}
