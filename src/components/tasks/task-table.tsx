"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Plus, GripVertical, Loader2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask, updateTask, setTaskReviewer, reorderTasks, deleteTask } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/task-status";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskRowMenu } from "./task-row-menu";
import { TaskItem, Option } from "./task-types";

const NONE = "__none__";

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function TaskTable({
  applicationId,
  phaseId,
  tasks,
  assignableUsers,
  defaultAssignedUserId,
  currentUserId,
}: {
  applicationId: string;
  phaseId: string | null;
  tasks: TaskItem[];
  assignableUsers: Option[];
  defaultAssignedUserId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    startTransition(async () => {
      try {
        await reorderTasks(applicationId, reordered.map((t) => t.id));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reorder tasks");
      }
    });
  }

  function handleDelete(taskId: string) {
    setDeletingId(taskId);
    startTransition(async () => {
      try {
        await deleteTask(taskId);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete task");
      } finally {
        setDeletingId(null);
      }
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addRow(parentTaskId?: string) {
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    if (phaseId) formData.set("phaseId", phaseId);
    if (parentTaskId) formData.set("parentTaskId", parentTaskId);
    formData.set("label", "New Task");
    formData.set("assignedUserId", defaultAssignedUserId);

    startTransition(async () => {
      try {
        const created = await createTask(formData);
        setNewRowId(created.id);
        if (parentTaskId) setExpandedIds((prev) => new Set(prev).add(parentTaskId));
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add task");
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Reviewer</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskTableRows
                key={task.id}
                task={task}
                assignableUsers={assignableUsers}
                expanded={expandedIds.has(task.id)}
                onToggleExpand={() => toggleExpand(task.id)}
                onAddSubtask={() => addRow(task.id)}
                onDelete={handleDelete}
                deletingId={deletingId}
                currentUserId={currentUserId}
                autoFocusId={newRowId}
              />
            ))}
          </SortableContext>
          <TableRow>
            <TableCell colSpan={6} className="p-0">
              <button
                type="button"
                onClick={() => addRow()}
                disabled={isPending}
                className="flex w-full items-center gap-1.5 px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add task
              </button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </DndContext>
  );
}

function InlineRow({
  task,
  assignableUsers,
  indent,
  expandControl,
  extra,
  deleteControl,
  autoFocusLabel,
  rowRef,
  rowStyle,
}: {
  task: TaskItem;
  assignableUsers: Option[];
  indent: boolean;
  expandControl?: React.ReactNode;
  extra?: React.ReactNode;
  deleteControl?: React.ReactNode;
  autoFocusLabel?: boolean;
  rowRef?: (node: HTMLElement | null) => void;
  rowStyle?: React.CSSProperties;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [label, setLabel] = useState(task.label);
  const [status, setStatus] = useState(task.status);
  const [assignedUserId, setAssignedUserId] = useState(task.assignedUser.id);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? "");
  const [reviewerId, setReviewerId] = useState(task.reviewer?.id ?? NONE);

  function save(overrides: Partial<{ label: string; status: string; assignedUserId: string; dueDate: string; blockedReason: string }>) {
    const formData = new FormData();
    formData.set("label", overrides.label ?? label);
    formData.set("status", overrides.status ?? status);
    formData.set("assignedUserId", overrides.assignedUserId ?? assignedUserId);
    formData.set("dueDate", overrides.dueDate ?? dueDate);
    formData.set("blockedReason", overrides.blockedReason ?? blockedReason);
    startTransition(async () => {
      try {
        await updateTask(task.id, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      }
    });
  }

  function handleReviewerChange(value: string | null) {
    const next = value ?? NONE;
    setReviewerId(next);
    startTransition(async () => {
      try {
        await setTaskReviewer(task.id, next === NONE ? null : next);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update reviewer");
      }
    });
  }

  return (
    <TableRow ref={rowRef} style={rowStyle} className={indent ? "bg-muted/30" : undefined}>
      <TableCell className={indent ? "pl-10" : undefined}>
        <div className="flex items-center gap-1">
          {expandControl}
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label.trim().length === 0) {
                setLabel(task.label);
                return;
              }
              save({ label });
            }}
            autoFocus={autoFocusLabel}
            onFocus={(e) => e.target.select()}
            className="h-8 min-w-[10rem] border-transparent bg-transparent font-medium hover:border-input focus-visible:border-ring"
          />
          {extra}
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <Select
            items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]]))}
            value={status}
            onValueChange={(v) => {
              const next = (v ?? status) as typeof status;
              setStatus(next);
              save({ status: next });
            }}
          >
            <SelectTrigger size="sm" className="w-[9.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {status === "BLOCKED" && (
            <Input
              placeholder="Blocked on…"
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              onBlur={() => save({ blockedReason })}
              className="h-7 w-[9.5rem] text-xs"
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
          value={assignedUserId}
          onValueChange={(v) => {
            const next = v ?? assignedUserId;
            setAssignedUserId(next);
            save({ assignedUserId: next });
          }}
        >
          <SelectTrigger size="sm" className="w-[9rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assignableUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            save({ dueDate: e.target.value });
          }}
          className="h-8 w-[9rem]"
        />
      </TableCell>
      <TableCell>
        <Select
          items={{ [NONE]: "None", ...Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])) }}
          value={reviewerId}
          onValueChange={handleReviewerChange}
        >
          <SelectTrigger size="sm" className="w-[9rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {assignableUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{deleteControl}</TableCell>
    </TableRow>
  );
}

function TaskTableRows({
  task,
  assignableUsers,
  expanded,
  onToggleExpand,
  onAddSubtask,
  onDelete,
  deletingId,
  currentUserId,
  autoFocusId,
}: {
  task: TaskItem;
  assignableUsers: Option[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddSubtask: () => void;
  onDelete: (taskId: string) => void;
  deletingId: string | null;
  currentUserId: string;
  autoFocusId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <Fragment>
      <InlineRow
        task={task}
        assignableUsers={assignableUsers}
        indent={false}
        autoFocusLabel={task.id === autoFocusId}
        rowRef={setNodeRef}
        rowStyle={rowStyle}
        expandControl={
          <div className="flex items-center">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
              title="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </button>
            {task.subtasks.length > 0 ? (
              <button type="button" onClick={onToggleExpand} className="text-muted-foreground">
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
          </div>
        }
        extra={
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" className="size-6" onClick={onAddSubtask} title="Add subtask">
              <Plus className="size-3.5" />
            </Button>
            <TaskDetailDialog
              taskId={task.id}
              label={task.label}
              description={task.description}
              status={task.status}
              dueDate={task.dueDate}
              blockedReason={task.blockedReason}
              assignedUserId={task.assignedUser.id}
              reviewerId={task.reviewer?.id ?? null}
              hasReviewer
              assignableUsers={assignableUsers}
              canDelete={task.createdById === currentUserId || task.assignedUser.id === currentUserId}
              subtaskCount={task.subtasks.length}
            />
          </div>
        }
        deleteControl={
          (task.createdById === currentUserId || task.assignedUser.id === currentUserId) && (
            <TaskRowMenu
              onDelete={() => onDelete(task.id)}
              isDeleting={deletingId === task.id}
              subtaskCount={task.subtasks.length}
            />
          )
        }
      />
      {expanded &&
        task.subtasks.map((subtask) => (
          <InlineRow
            key={subtask.id}
            task={{ ...subtask, subtasks: [] }}
            assignableUsers={assignableUsers}
            indent
            autoFocusLabel={subtask.id === autoFocusId}
            deleteControl={
              (subtask.createdById === currentUserId || subtask.assignedUser.id === currentUserId) && (
                <TaskRowMenu
                  onDelete={() => onDelete(subtask.id)}
                  isDeleting={deletingId === subtask.id}
                  subtaskCount={0}
                />
              )
            }
          />
        ))}
    </Fragment>
  );
}
