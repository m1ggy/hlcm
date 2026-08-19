"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask, updateTask, setTaskReviewer, reorderTasks } from "@/lib/actions/tasks";
import { isTaskOverdue } from "@/lib/task-status";
import { TaskStatusSelect } from "./task-status-select";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskItem, Option } from "./task-types";

const NONE = "__none__";

const COL_WIDTH_KEY = "hclm:task-table-col-widths";
const DEFAULT_COL_WIDTHS = { task: 260, status: 160, assigned: 144, due: 144, reviewer: 144 };
const MIN_COL_WIDTHS: Record<ColKey, number> = { task: 140, status: 120, assigned: 100, due: 110, reviewer: 100 };
type ColKey = keyof typeof DEFAULT_COL_WIDTHS;

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

// Thin drag handle on a column's right edge — mousedown starts tracking the
// pointer, resizes just that column, and persists the whole width set to
// localStorage on release so it's remembered across visits.
function ColumnResizeHandle({
  colKey,
  onResize,
}: {
  colKey: ColKey;
  onResize: (key: ColKey, e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        onResize(colKey, e);
      }}
      title="Drag to resize column"
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40"
    />
  );
}

export function TaskTable({
  applicationId,
  phaseId,
  tasks,
  assignableUsers,
  defaultAssignedUserId,
}: {
  applicationId: string;
  phaseId: string | null;
  tasks: TaskItem[];
  assignableUsers: Option[];
  defaultAssignedUserId: string;
}) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const id = setTimeout(() => {
      const saved = window.localStorage.getItem(COL_WIDTH_KEY);
      if (!saved) return;
      try {
        setColWidths((w) => ({ ...w, ...JSON.parse(saved) }));
      } catch {
        // ignore malformed storage
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function startResize(key: ColKey, e: React.MouseEvent) {
    const startX = e.clientX;
    const startWidth = colWidths[key];
    let latest = startWidth;

    function onMove(ev: MouseEvent) {
      latest = Math.max(MIN_COL_WIDTHS[key], startWidth + (ev.clientX - startX));
      setColWidths((w) => ({ ...w, [key]: latest }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setColWidths((w) => {
        const next = { ...w, [key]: latest };
        window.localStorage.setItem(COL_WIDTH_KEY, JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

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
      {/* width: 100% + minWidth: sum-of-columns — fills the card (columns
          stretch proportionally, keeping their relative ratio) whenever the
          card is wide enough, but never shrinks past what the columns were
          set to. Once the card is narrower than that minimum, the Table
          wrapper's overflow-x-auto kicks in with a real scrollbar instead of
          squeezing everything to fit. */}
      <Table
        className="table-fixed"
        style={{ width: "100%", minWidth: Object.values(colWidths).reduce((a, b) => a + b, 0) }}
      >
        <colgroup>
          <col style={{ width: colWidths.task }} />
          <col style={{ width: colWidths.status }} />
          <col style={{ width: colWidths.assigned }} />
          <col style={{ width: colWidths.due }} />
          <col style={{ width: colWidths.reviewer }} />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="relative">
              Task
              <ColumnResizeHandle colKey="task" onResize={startResize} />
            </TableHead>
            <TableHead className="relative">
              Status
              <ColumnResizeHandle colKey="status" onResize={startResize} />
            </TableHead>
            <TableHead className="relative">
              Assigned
              <ColumnResizeHandle colKey="assigned" onResize={startResize} />
            </TableHead>
            <TableHead className="relative">
              Due
              <ColumnResizeHandle colKey="due" onResize={startResize} />
            </TableHead>
            <TableHead className="relative">
              Reviewer
              <ColumnResizeHandle colKey="reviewer" onResize={startResize} />
            </TableHead>
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
                autoFocusId={newRowId}
              />
            ))}
          </SortableContext>
          <TableRow>
            <TableCell colSpan={5} className="p-0">
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
  autoFocusLabel,
  rowRef,
  rowStyle,
}: {
  task: TaskItem;
  assignableUsers: Option[];
  indent: boolean;
  expandControl?: React.ReactNode;
  extra?: React.ReactNode;
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

  const overdue = isTaskOverdue(dueDate, status);

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
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent font-medium hover:border-input focus-visible:border-ring"
          />
          {extra}
        </div>
      </TableCell>
      <TableCell className={status === "COMPLETED" ? "bg-emerald-500/10 dark:bg-emerald-500/15" : undefined}>
        <div className="space-y-1">
          <TaskStatusSelect
            value={status}
            onValueChange={(next) => {
              setStatus(next);
              save({ status: next });
            }}
            className="w-full"
          />
          {status === "BLOCKED" && (
            <Input
              placeholder="Blocked on…"
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              onBlur={() => save({ blockedReason })}
              className="h-7 w-full text-xs"
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
          <SelectTrigger size="sm" className="w-full">
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
        {/* flex flex-col, not space-y-1: TableCell forces whitespace-nowrap,
            which keeps inline-level siblings (the date <input>, the Badge)
            on one unbroken line instead of wrapping — that line then
            overflowed into the Reviewer column. An explicit flex column
            stacks them regardless of the nowrap ancestor. */}
        <div className="flex flex-col gap-1">
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              save({ dueDate: e.target.value });
            }}
            className={
              overdue
                ? "h-8 w-full border-destructive/50 text-destructive focus-visible:border-ring"
                : "h-8 w-full"
            }
          />
          {overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <Select
          items={{ [NONE]: "None", ...Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])) }}
          value={reviewerId}
          onValueChange={handleReviewerChange}
        >
          <SelectTrigger size="sm" className="w-full">
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
    </TableRow>
  );
}

function TaskTableRows({
  task,
  assignableUsers,
  expanded,
  onToggleExpand,
  onAddSubtask,
  autoFocusId,
}: {
  task: TaskItem;
  assignableUsers: Option[];
  expanded: boolean;
  onToggleExpand: () => void;
  onAddSubtask: () => void;
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
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex items-center gap-0.5 text-muted-foreground"
                title={expanded ? "Collapse subtasks" : "Expand subtasks"}
              >
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <span className="text-xs tabular-nums">{task.subtasks.length}</span>
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
            />
          </div>
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
          />
        ))}
    </Fragment>
  );
}
