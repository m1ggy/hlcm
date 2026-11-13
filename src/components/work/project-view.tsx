"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CornerDownLeft, Lock, MessageSquare, Paperclip, Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createTaskAction, moveTaskAction } from "@/lib/actions/work";
import { WORK_TASK_STATUSES, WORK_TASK_STATUS_LABELS, describeActivity, isOverdue, type WorkScope, type WorkTaskStatus, type WorkTaskPriority } from "@/lib/work";
import type { ProjectTask } from "@/lib/work-data";
import { TemplateMenu } from "./template-menu";
import { NewTaskDialog, type CreatedTask } from "./new-task-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskCheck } from "./task-update-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { PriorityLabel, StatusDot, formatDay } from "./work-status";
import { TaskSheet } from "./task-sheet";

type Activity = {
  id: string;
  kind: string;
  from: string | null;
  to: string | null;
  occurredAt: Date;
  actor: { id: string; name: string };
  task: { id: string; title: string };
};

const ANYONE = "__all__";
const UNASSIGNED = "__none__";

export function ProjectView({
  projectId,
  projectClientVisible,
  tasks,
  activity,
  scope,
  currentUserId,
  people,
  today,
  initialTaskId,
}: {
  projectId: string;
  /** The client can see this project (and so a visible task's updates). */
  projectClientVisible: boolean;
  tasks: ProjectTask[];
  activity: Activity[];
  scope: WorkScope;
  currentUserId: string;
  people: { id: string; name: string }[];
  today: string;
  initialTaskId: string | null;
}) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialTaskId);
  const [assignee, setAssignee] = useState(ANYONE);
  const [hideDone, setHideDone] = useState(false);
  const [creating, setCreating] = useState(false);

  // Keep ?task= in the address so a task can be linked to (no server round trip).
  const openTask = useCallback((id: string | null) => {
    setOpenTaskId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", id);
    else url.searchParams.delete("task");
    window.history.replaceState(null, "", url);
  }, []);
  const onSheetOpenChange = useCallback((open: boolean) => !open && openTask(null), [openTask]);

  // A task someone just made must never vanish behind a filter.
  const onCreated = useCallback(
    (task: CreatedTask, openIt: boolean) => {
      setHideDone(false);
      setAssignee((current) => {
        const stillShown = current === ANYONE || (current === UNASSIGNED ? task.assigneeIds.length === 0 : task.assigneeIds.includes(current));
        return stillShown ? current : ANYONE;
      });
      if (openIt) openTask(task.id);
    },
    [openTask]
  );

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (hideDone && (t.status === "DONE" || t.status === "CANCELLED")) return false;
        if (assignee === UNASSIGNED) return t.assignees.length === 0;
        if (assignee !== ANYONE) return t.assignees.some((a) => a.id === assignee);
        return true;
      }),
    [tasks, assignee, hideDone]
  );

  const assigneeItems = { [ANYONE]: "Everyone", [UNASSIGNED]: "Unassigned", ...Object.fromEntries(people.map((p) => [p.id, p.name])) };

  return (
    <>
      <Tabs defaultValue="list" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-3">
            {scope.canEditTasks && (
              <Button size="sm" onClick={() => setCreating(true)} data-tour="new-task">
                <Plus className="size-4" /> New task
              </Button>
            )}
            {scope.canEditTasks && <TemplateMenu projectId={projectId} onCreated={openTask} />}
            {scope.side === "team" && (
              <Select items={assigneeItems} value={assignee} onValueChange={(v) => setAssignee(v ?? ANYONE)}>
                <SelectTrigger size="sm" className="w-40" aria-label="Filter by assignee">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(assigneeItems).map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={hideDone} onCheckedChange={(v) => setHideDone(Boolean(v))} />
              Hide finished
            </label>
          </div>
        </div>

        <TabsContent value="list">
          {tasks.length === 0 && scope.canEditTasks ? (
            <EmptyProject onNew={() => setCreating(true)} />
          ) : (
            <TaskList
              projectId={projectId}
              projectClientVisible={projectClientVisible}
              tasks={filtered}
              scope={scope}
              today={today}
              onOpen={openTask}
              onCreated={onCreated}
              quickAddAssignee={people.some((p) => p.id === currentUserId) ? currentUserId : null}
              showEmptyGroups={!hideDone && assignee === ANYONE}
            />
          )}
        </TabsContent>
        <TabsContent value="board">
          <TaskBoard key={filtered.map((t) => `${t.id}:${t.status}:${t.sortOrder}`).join(",")} tasks={filtered} scope={scope} today={today} onOpen={openTask} projectClientVisible={projectClientVisible} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityList activity={activity} onOpen={openTask} />
        </TabsContent>
      </Tabs>

      {scope.canEditTasks && (
        <NewTaskDialog
          open={creating}
          onOpenChange={setCreating}
          projectId={projectId}
          projectClientVisible={projectClientVisible}
          people={people}
          currentUserId={currentUserId}
          onCreated={onCreated}
        />
      )}
      <TaskSheet taskId={openTaskId} onOpenChange={onSheetOpenChange} onOpenTask={openTask} scope={scope} currentUserId={currentUserId} people={people} />
    </>
  );
}

function EmptyProject({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <p className="font-medium">No tasks in this project yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">Add the first one: give it a title, pick who does it and when it&apos;s due.</p>
      <Button onClick={onNew}>
        <Plus className="size-4" /> New task
      </Button>
    </div>
  );
}

function TaskMeta({ task, today }: { task: ProjectTask; today: string }) {
  const overdue = isOverdue(task, today);
  return (
    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
      <PriorityLabel priority={task.priority as WorkTaskPriority} />
      {task.subtaskCount > 0 && (
        <span className="tabular-nums">
          {task.subtasksDone}/{task.subtaskCount}
        </span>
      )}
      {task.commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <MessageSquare className="size-3" aria-label="Comments" /> {task.commentCount}
        </span>
      )}
      {task.fileCount > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <Paperclip className="size-3" aria-label="Files" /> {task.fileCount}
        </span>
      )}
      {task.dueDate && <span className={cn(overdue && "font-semibold text-destructive")}>{overdue ? `Overdue · ${formatDay(task.dueDate)}` : formatDay(task.dueDate)}</span>}
      {task.assignees.length > 0 && (
        <span className="flex -space-x-1.5">
          {task.assignees.slice(0, 3).map((a) => (
            <AvatarInitials key={a.id} name={a.name} className="size-5 text-[0.6rem] ring-2 ring-card" />
          ))}
        </span>
      )}
    </div>
  );
}

function TaskList({
  projectId,
  projectClientVisible,
  tasks,
  scope,
  today,
  onOpen,
  onCreated,
  quickAddAssignee,
  showEmptyGroups,
}: {
  projectId: string;
  projectClientVisible: boolean;
  tasks: ProjectTask[];
  scope: WorkScope;
  today: string;
  onOpen: (id: string) => void;
  onCreated: (task: CreatedTask, openIt: boolean) => void;
  /** Quick-added tasks go to whoever adds them, when they can hold tasks here. */
  quickAddAssignee: string | null;
  showEmptyGroups: boolean;
}) {
  const groups = WORK_TASK_STATUSES.map((status) => ({ status, tasks: tasks.filter((t) => t.status === status) })).filter(
    (g) => g.tasks.length > 0 || (showEmptyGroups && scope.canEditTasks && g.status === "TODO")
  );
  if (groups.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No tasks match these filters.</p>;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.status} className="space-y-1">
          <h2 className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <StatusDot status={g.status} /> {WORK_TASK_STATUS_LABELS[g.status]} <span className="font-normal tabular-nums">{g.tasks.length}</span>
          </h2>
          <ul className="divide-y rounded-lg border bg-card">
            {g.tasks.map((t) => (
              <li key={t.id} className="flex items-center hover:bg-muted/60">
                {scope.canEditTasks && (
                  <TaskCheck
                    className="ml-3"
                    task={{ id: t.id, title: t.title, status: t.status, clientCanSee: projectClientVisible && t.clientVisible, needsApproval: t.needsApproval }}
                  />
                )}
                <button type="button" onClick={() => onOpen(t.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left focus-visible:bg-muted/60">
                  <span className={cn("min-w-0 flex-1 text-sm", (t.status === "DONE" || t.status === "CANCELLED") && "text-muted-foreground")}>
                    {t.title}
                    {t.isClientRequest && (
                      <Badge variant={t.needsApproval ? "outline" : "secondary"} className="ml-2 align-middle">
                        {t.needsApproval ? "Waiting for approval" : "Client request"}
                      </Badge>
                    )}
                    {scope.canSeeInternal && !t.clientVisible && <Lock className="ml-1.5 inline size-3 text-muted-foreground" aria-label="Hidden from client" />}
                  </span>
                  <TaskMeta task={t} today={today} />
                </button>
              </li>
            ))}
            {g.status === "TODO" && scope.canEditTasks && <QuickAdd projectId={projectId} assignTo={quickAddAssignee} onCreated={onCreated} />}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Fast entry: type a title, then Enter, the + or Add. Assigned to you; the
 * toast offers the task's panel for the rest. The field keeps focus so a list
 * can be typed in one go; Escape clears it.
 */
function QuickAdd({ projectId, assignTo, onCreated }: { projectId: string; assignTo: string | null; onCreated: (task: CreatedTask, openIt: boolean) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const typed = title.trim().length > 0;

  function add() {
    const t = title.trim();
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    if (isPending) return;
    startTransition(async () => {
      const assigneeIds = assignTo ? [assignTo] : [];
      const r = await createTaskAction({ projectId, title: t, assigneeIds });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setTitle("");
      inputRef.current?.focus();
      router.refresh();
      const created = { id: r.data.id, title: t, assigneeIds };
      onCreated(created, false);
      toast.success(`Added "${t}" to To do${assignTo ? ", assigned to you" : ""}`, { action: { label: "Add details", onClick: () => onCreated(created, true) } });
    });
  }

  return (
    <li>
      <form
        className="flex items-center gap-2 px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Button
          type="button"
          size="icon-sm"
          variant={typed ? "default" : "ghost"}
          onClick={add}
          disabled={isPending}
          aria-label={typed ? "Add this task" : "Quick add a task"}
          title={typed ? "Add this task" : "Quick add a task"}
          className={cn("shrink-0", !typed && "text-muted-foreground")}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && title) {
              e.preventDefault();
              setTitle("");
            }
          }}
          readOnly={isPending}
          placeholder="Quick add: type a task title"
          aria-label="Quick add a task"
          className="h-8 border-dashed px-2 shadow-none"
        />
        {typed && (
          <Button type="submit" size="sm" variant="secondary" loading={isPending} className="shrink-0">
            Add <CornerDownLeft className="size-3.5" aria-hidden />
          </Button>
        )}
      </form>
    </li>
  );
}

// ---- Board ------------------------------------------------------------------

function BoardCard({ task, today, onOpen, draggable, projectClientVisible }: { task: ProjectTask; today: string; onOpen: (id: string) => void; draggable: boolean; projectClientVisible: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative">
      {draggable && (
        <TaskCheck
          className="absolute top-3.5 left-3"
          task={{ id: task.id, title: task.title, status: task.status, clientCanSee: projectClientVisible && task.clientVisible, needsApproval: task.needsApproval }}
        />
      )}
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={cn("flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-xs hover:border-ring/50", draggable && "cursor-grab pl-9 active:cursor-grabbing")}
      >
        <span className="text-sm font-medium">{task.title}</span>
        {task.isClientRequest && (
          <Badge variant={task.needsApproval ? "outline" : "secondary"} className="self-start">
            {task.needsApproval ? "Waiting for approval" : "Client request"}
          </Badge>
        )}
        <TaskMeta task={task} today={today} />
      </button>
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  today,
  onOpen,
  draggable,
  projectClientVisible,
}: {
  status: WorkTaskStatus;
  tasks: ProjectTask[];
  today: string;
  onOpen: (id: string) => void;
  draggable: boolean;
  projectClientVisible: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `column:${status}` });
  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <StatusDot status={status} /> {WORK_TASK_STATUS_LABELS[status]} <span className="font-normal tabular-nums">{tasks.length}</span>
      </h2>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2 rounded-lg bg-muted/50 p-2">
          {tasks.length === 0 && <p className="px-1 py-3 text-center text-xs text-muted-foreground">{draggable ? "Drop tasks here" : "Nothing here"}</p>}
          {tasks.map((t) => (
            <BoardCard key={t.id} task={t} today={today} onOpen={onOpen} draggable={draggable} projectClientVisible={projectClientVisible} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function TaskBoard({
  tasks,
  scope,
  today,
  onOpen,
  projectClientVisible,
}: {
  tasks: ProjectTask[];
  scope: WorkScope;
  today: string;
  onOpen: (id: string) => void;
  projectClientVisible: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const draggable = scope.canEditTasks;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const moving = items.find((t) => t.id === active.id);
    if (!moving) return;
    const overId = String(over.id);
    const target: WorkTaskStatus = overId.startsWith("column:") ? (overId.slice(7) as WorkTaskStatus) : (items.find((t) => t.id === overId)?.status ?? moving.status);

    const column = items.filter((t) => t.status === target && t.id !== moving.id);
    const overIndex = column.findIndex((t) => t.id === overId);
    const insertAt = overIndex === -1 ? column.length : overIndex;
    const ordered = [...column.slice(0, insertAt), { ...moving, status: target }, ...column.slice(insertAt)];

    const previous = items;
    setItems([...items.filter((t) => t.status !== target && t.id !== moving.id), ...ordered.map((t, i) => ({ ...t, sortOrder: i + 1 }))]);
    moveTaskAction(moving.id, target, ordered.map((t) => t.id)).then((r) => {
      if (!r.ok) {
        setItems(previous);
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  const columns = WORK_TASK_STATUSES.map((status) => ({
    status,
    tasks: items.filter((t) => t.status === status).sort((a, b) => a.sortOrder - b.sortOrder),
  }));

  return (
    <DndContext id="work-board" sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((c) => (
          <BoardColumn key={c.status} status={c.status} tasks={c.tasks} today={today} onOpen={onOpen} draggable={draggable} projectClientVisible={projectClientVisible} />
        ))}
      </div>
    </DndContext>
  );
}

// ---- Activity ---------------------------------------------------------------

function ActivityList({ activity, onOpen }: { activity: Activity[]; onOpen: (id: string) => void }) {
  if (activity.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Nothing has happened here yet.</p>;
  const dayOf = (d: Date) => new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <ol className="space-y-1.5">
      {activity.map((a, i) => {
        const day = dayOf(a.occurredAt);
        const header = i === 0 || dayOf(activity[i - 1].occurredAt) !== day;
        return (
          <li key={a.id}>
            {header && <h3 className="pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day}</h3>}
            <p className="text-sm">
              <span className="text-xs text-muted-foreground tabular-nums">{new Date(a.occurredAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>{" "}
              <span className="font-medium">{a.actor.name}</span> {describeActivity(a)} on{" "}
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpen(a.task.id)}>
                {a.task.title}
              </button>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
