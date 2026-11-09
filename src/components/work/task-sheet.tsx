"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookmarkPlus, Check, Download, Lock, Paperclip, Play, Repeat, Trash2, Users } from "lucide-react";
import {
  addCommentAction,
  approveRequestAction,
  createTaskAction,
  declineRequestAction,
  deleteCommentAction,
  deleteTaskAction,
  deleteWorkTaskFileAction,
  getTaskDetailAction,
  saveTemplateAction,
  setAssigneesAction,
  startWorkTimerAction,
  updateTaskAction,
} from "@/lib/actions/work";
import {
  WORK_REPEATS,
  WORK_REPEAT_LABELS,
  WORK_TASK_PRIORITIES,
  WORK_TASK_PRIORITY_LABELS,
  WORK_TASK_STATUSES,
  WORK_TASK_STATUS_LABELS,
  describeActivity,
  isOpenStatus,
  type WorkRepeat,
  type WorkScope,
  type WorkTaskPriority,
  type WorkTaskStatus,
} from "@/lib/work";
import type { TaskDetail } from "@/lib/work-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { StatusDot, WorkStatusPill, formatDay } from "./work-status";
import { useUpload } from "@/components/files/use-upload";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";
import { UploadProgress } from "@/components/files/upload-progress";
import { reportBatch } from "@/components/files/report-batch";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function dayValue(d: Date | string | null) {
  if (!d) return "";
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

function when(d: Date | string) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The side panel for one task. Loads the task through getTaskDetailAction,
 * which filters it for whoever is looking (client-side people never get
 * internal comments, activity or hours).
 */
export function TaskSheet({
  taskId,
  onOpenChange,
  onOpenTask,
  scope,
  currentUserId,
  people,
}: {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Open another task in the panel (a subtask, or back to its parent). */
  onOpenTask: (id: string) => void;
  scope: WorkScope;
  currentUserId: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loaded, setTask] = useState<TaskDetail | null>(null);
  // Showing a different task than asked for means it's still loading.
  const task = loaded && loaded.id === taskId ? loaded : null;
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async (id: string) => {
    const result = await getTaskDetailAction(id);
    if (!result.ok) {
      toast.error(result.error);
      onOpenChange(false);
      return;
    }
    setTask(result.data);
  }, [onOpenChange]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    getTaskDetailAction(taskId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.error);
        onOpenChange(false);
        return;
      }
      setTask(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, onOpenChange]);

  /** Runs a change, then reloads the panel and the page behind it. */
  function run<T>(fn: () => Promise<Result<T>>, success?: string) {
    if (!task) return;
    const id = task.id;
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (success) toast.success(success);
      await load(id);
      router.refresh();
    });
  }

  const edit = scope.canEditTasks;

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        {!task ? (
          <div className="space-y-3 p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Loading task</SheetTitle>
            </SheetHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <TaskBody
            key={task.id}
            task={task}
            edit={edit}
            scope={scope}
            people={people}
            currentUserId={currentUserId}
            isPending={isPending}
            run={run}
            onOpenTask={onOpenTask}
            onDeleted={() => {
              onOpenChange(false);
              router.refresh();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskBody({
  task,
  edit,
  scope,
  people,
  currentUserId,
  isPending,
  run,
  onOpenTask,
  onDeleted,
}: {
  task: TaskDetail;
  edit: boolean;
  scope: WorkScope;
  people: { id: string; name: string }[];
  currentUserId: string;
  isPending: boolean;
  run: <T>(fn: () => Promise<Result<T>>, success?: string) => void;
  onOpenTask: (id: string) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [assignees, setAssignees] = useState(task.assignees.map((a) => a.user.id));
  const [newSubtask, setNewSubtask] = useState("");
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(scope.canSeeInternal);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { status: uploadStatus, uploadMany, cancel: cancelUpload, uploading } = useUpload();

  const status = task.status as WorkTaskStatus;
  // Assignee options: the team, plus anyone already on it.
  const peopleItems = Object.fromEntries([...people, ...task.assignees.map((a) => a.user)].map((p) => [p.id, p.name]));
  const canDelete = edit && (scope.canManageProjects || task.createdBy.id === currentUserId);
  // A client's request no manager has accepted yet (workspace tasks Phase 5).
  const pending = task.isClientRequest && !task.approvedAt && status !== "CANCELLED";
  const repeatItems: Record<string, string> = { NONE: "Doesn't repeat", ...WORK_REPEAT_LABELS };

  function upload(files: File[]) {
    if (files.length === 0) return;
    const big = files.find((f) => f.size > MAX_FILE_BYTES);
    if (big) return void toast.error(fileTooLargeMessage(big.name));
    // Always "ok" so run() reloads the task; reportBatch has already said
    // what failed.
    run(async () => {
      const outcome = await uploadMany("workTask", task.id, files);
      reportBatch(outcome);
      if (outcome.uploaded.length === 1 && outcome.failed.length === 0 && !outcome.cancelled) toast.success("File added");
      return { ok: true as const, data: undefined };
    });
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <SheetHeader className="gap-1 p-0 pr-8">
        <SheetDescription className="flex flex-wrap items-center gap-x-1 text-xs">
          <span>{task.project.name}</span>
          {task.parent && (
            <>
              <span aria-hidden>/</span>
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpenTask(task.parent!.id)}>
                {task.parent.title}
              </button>
            </>
          )}
        </SheetDescription>
        {edit ? (
          <>
            <SheetTitle className="sr-only">{task.title}</SheetTitle>
            <Input
              aria-label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && run(() => updateTaskAction(task.id, { title }))}
              className="h-auto border-transparent px-1 font-heading text-xl font-semibold shadow-none hover:border-input focus-visible:border-input md:text-xl"
            />
          </>
        ) : (
          <SheetTitle className="font-heading text-xl font-semibold">{task.title}</SheetTitle>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {task.isClientRequest && <Badge variant="secondary">Client request</Badge>}
          {pending && <Badge variant="outline">Waiting for approval</Badge>}
          {task.repeat && (
            <Badge variant="outline" className="gap-1">
              <Repeat className="size-3" /> {WORK_REPEAT_LABELS[task.repeat as WorkRepeat]}
            </Badge>
          )}
          {edit && !task.clientVisible && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> Hidden from client
            </Badge>
          )}
        </div>
      </SheetHeader>

      {pending && edit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <p>
            {scope.canManageProjects
              ? "The client asked for this. Accept it to start work, or decline it below."
              : "The client asked for this. A manager needs to accept it before work starts."}
          </p>
          {scope.canManageProjects && (
            <Button size="sm" disabled={isPending} onClick={() => run(() => approveRequestAction(task.id, assignees), "Request accepted")}>
              <Check className="size-3.5" /> Accept request
            </Button>
          )}
        </div>
      )}

      {task.declineReason && status === "CANCELLED" && (
        <div className="rounded-lg border bg-muted px-3 py-2 text-sm">
          <p className="font-medium">Request declined</p>
          <p className="text-muted-foreground">{task.declineReason}</p>
        </div>
      )}

      {/* Fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Status</Label>
          {edit ? (
            <Select items={WORK_TASK_STATUS_LABELS} value={status} onValueChange={(v) => v && v !== status && run(() => updateTaskAction(task.id, { status: v as WorkTaskStatus }))}>
              <SelectTrigger className="w-full" disabled={isPending || pending}>
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
          ) : (
            <div>
              <WorkStatusPill status={status} />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          {edit ? (
            <Select
              items={WORK_TASK_PRIORITY_LABELS}
              value={task.priority}
              onValueChange={(v) => v && v !== task.priority && run(() => updateTaskAction(task.id, { priority: v as WorkTaskPriority }))}
            >
              <SelectTrigger className="w-full" disabled={isPending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {WORK_TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">{WORK_TASK_PRIORITY_LABELS[task.priority as WorkTaskPriority]}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="task-start">Start</Label>
          {edit ? (
            <Input id="task-start" type="date" defaultValue={dayValue(task.startDate)} onChange={(e) => run(() => updateTaskAction(task.id, { startDate: e.target.value }))} />
          ) : (
            <p className="text-sm">{formatDay(task.startDate, { month: "short", day: "numeric", year: "numeric" }) ?? "—"}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="task-due">Due</Label>
          {edit ? (
            <Input id="task-due" type="date" defaultValue={dayValue(task.dueDate)} onChange={(e) => run(() => updateTaskAction(task.id, { dueDate: e.target.value }))} />
          ) : (
            <p className="text-sm">{formatDay(task.dueDate, { month: "short", day: "numeric", year: "numeric" }) ?? "—"}</p>
          )}
        </div>
        {edit && !task.parent && (
          <div className="space-y-1 sm:col-span-2">
            <Label>Repeat</Label>
            <Select
              items={repeatItems}
              value={task.repeat ?? "NONE"}
              onValueChange={(v) => v && v !== (task.repeat ?? "NONE") && run(() => updateTaskAction(task.id, { repeat: v === "NONE" ? null : (v as WorkRepeat) }))}
            >
              <SelectTrigger className="w-full" disabled={isPending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["NONE", ...WORK_REPEATS] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    {repeatItems[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {task.repeat && <p className="text-xs text-muted-foreground">When it&apos;s marked done, the next one is created, due one period later.</p>}
          </div>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Label>Assignees</Label>
          {edit ? (
            <MultiUserSelect
              items={peopleItems}
              value={assignees}
              onValueChange={(next) => {
                setAssignees(next);
                run(() => setAssigneesAction(task.id, next));
              }}
              placeholder="Add people..."
            />
          ) : task.assignees.length ? (
            <div className="flex flex-wrap gap-2">
              {task.assignees.map((a) => (
                <span key={a.user.id} className="inline-flex items-center gap-1.5 text-sm">
                  <AvatarInitials name={a.user.name} className="size-5 text-[0.6rem]" /> {a.user.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned yet</p>
          )}
        </div>
      </div>

      {edit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={task.clientVisible} disabled={isPending || !task.project.clientVisible} onCheckedChange={(v) => run(() => updateTaskAction(task.id, { clientVisible: Boolean(v) }))} />
            Client can see this task
          </label>
          <div className="flex items-center gap-3">
            {task.trackedHours !== null && <span className="font-mono text-xs tabular-nums text-muted-foreground">{task.trackedHours}h tracked</span>}
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const r = await startWorkTimerAction(task.id);
                  if (r.ok) toast.success(r.data.clockedIn ? "Timer started. You're clocked in." : "Timer started");
                  return r;
                })
              }
            >
              <Play className="size-3.5" /> Start timer
            </Button>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="task-description">Description</Label>
        {edit ? (
          <Textarea
            id="task-description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (task.description ?? "") && run(() => updateTaskAction(task.id, { description }))}
            placeholder="Add details"
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{task.description || <span className="text-muted-foreground">No details.</span>}</p>
        )}
      </div>

      {/* Subtasks */}
      {!task.parent && (task.subtasks.length > 0 || edit) && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Subtasks {task.subtasks.length > 0 && `· ${task.subtasks.filter((s) => s.status === "DONE").length}/${task.subtasks.length}`}
          </h3>
          <ul className="space-y-1">
            {task.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                {edit ? (
                  <Checkbox
                    checked={s.status === "DONE"}
                    disabled={isPending}
                    aria-label={`Mark "${s.title}" done`}
                    onCheckedChange={(v) => run(() => updateTaskAction(s.id, { status: v ? "DONE" : "TODO" }))}
                  />
                ) : (
                  <StatusDot status={s.status as WorkTaskStatus} />
                )}
                <button type="button" onClick={() => onOpenTask(s.id)} className={cn("flex-1 text-left text-sm", s.status === "DONE" && "text-muted-foreground line-through")}>
                  {s.title}
                </button>
                {s.dueDate && <span className="text-xs text-muted-foreground">{formatDay(s.dueDate)}</span>}
              </li>
            ))}
          </ul>
          {edit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = newSubtask.trim();
                if (!t) return;
                setNewSubtask("");
                run(() => createTaskAction({ projectId: task.project.id, parentId: task.id, title: t, clientVisible: task.clientVisible }));
              }}
            >
              <Input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Add a subtask and press Enter" aria-label="New subtask" />
            </form>
          )}
        </section>
      )}

      {/* Files */}
      <section
        className="space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Files</h3>
          <Button size="sm" variant="ghost" disabled={isPending || uploading} onClick={() => fileInput.current?.click()}>
            <Paperclip className="size-3.5" /> Attach
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
        <UploadProgress status={uploadStatus} onCancel={cancelUpload} />
        {task.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Drop files here or use Attach.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {task.files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <a href={`/api/files/${f.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                  <Download className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.fileName}</span>
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{f.uploadedBy.name}</span>
                {(f.uploadedBy.id === currentUserId || scope.canManageProjects) && (
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.fileName}`} disabled={isPending} onClick={() => run(() => deleteWorkTaskFileAction(f.id), "File removed")}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      {/* Comments */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Comments</h3>
        {task.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        <ul className="space-y-3">
          {task.comments.map((c) => (
            <li key={c.id} className={cn("rounded-lg border px-3 py-2", c.visibility === "INTERNAL" && "border-dashed bg-muted/50")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AvatarInitials name={c.author.name} className="size-5 text-[0.6rem]" />
                <span className="font-medium text-foreground">{c.author.name}</span>
                <span>{when(c.createdAt)}</span>
                {c.visibility === "INTERNAL" && (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3" /> Internal
                  </span>
                )}
                {(c.author.id === currentUserId || scope.canManageProjects) && (
                  <button type="button" className="ml-auto hover:text-destructive" aria-label="Delete comment" onClick={() => run(() => deleteCommentAction(c.id))}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
        {scope.canComment && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const body = comment.trim();
              if (!body) return;
              setComment("");
              run(() => addCommentAction(task.id, { body, visibility: internal ? "INTERNAL" : "CLIENT" }));
            }}
          >
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={internal ? "Internal note: only the team sees this" : "Write a comment"} aria-label="Comment" />
            <div className="flex items-center justify-between gap-2">
              {scope.canSeeInternal ? (
                <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Who sees this comment">
                  <button type="button" aria-pressed={internal} onClick={() => setInternal(true)} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", internal && "bg-muted font-semibold")}>
                    <Lock className="size-3" /> Team only
                  </button>
                  <button type="button" aria-pressed={!internal} onClick={() => setInternal(false)} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", !internal && "bg-muted font-semibold")}>
                    <Users className="size-3" /> Client can see
                  </button>
                </div>
              ) : (
                <span />
              )}
              <Button type="submit" size="sm" disabled={!comment.trim()} loading={isPending}>
                Comment
              </Button>
            </div>
          </form>
        )}
      </section>

      <Separator />

      {/* Activity */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Activity</h3>
        <ul className="space-y-1.5 text-sm">
          {task.activities.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when(a.occurredAt)}</span>
              <span>
                <span className="font-medium">{a.actor.name}</span> {describeActivity(a)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Template, request handling + delete */}
      {(canDelete || (edit && !task.parent) || (scope.canManageProjects && task.isClientRequest && isOpenStatus(status))) && (
        <>
          <Separator />
          <div className="space-y-3">
            {edit && !task.parent && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => saveTemplateAction(task.id), "Saved as a template for this project")}>
                <BookmarkPlus className="size-3.5" /> Save as template
              </Button>
            )}
            {scope.canManageProjects && task.isClientRequest && isOpenStatus(status) && (
              declining ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => declineRequestAction(task.id, reason), "Request declined");
                  }}
                >
                  <Label htmlFor="decline-reason">Why are you declining it? The client sees this.</Label>
                  <Textarea id="decline-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="destructive" disabled={!reason.trim()} loading={isPending}>
                      Decline request
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining(false)}>
                      Keep it
                    </Button>
                  </div>
                </form>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setDeclining(true)}>
                  Decline request
                </Button>
              )
            )}
            {canDelete &&
              (confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Delete this task{task.subtasks.length ? " and its subtasks" : ""}? This can&apos;t be undone.</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={isPending}
                    onClick={async () => {
                      const r = await deleteTaskAction(task.id);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Task deleted");
                      onDeleted();
                    }}
                  >
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> Delete task
                </Button>
              ))}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        {task.isClientRequest ? "Requested" : "Created"} by {task.createdBy.name} on {formatDay(task.createdAt, { month: "short", day: "numeric", year: "numeric" })}
        {task.completedAt && task.completedBy && ` · Done by ${task.completedBy.name} on ${formatDay(task.completedAt)}`}
      </p>
    </div>
  );
}
