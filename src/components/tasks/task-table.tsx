"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
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
import { createTask, updateTask, setTaskReviewer } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/task-status";
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Reviewer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <button
              type="button"
              onClick={() => addRow()}
              disabled={isPending}
              className="flex w-full items-center gap-1.5 px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-4" /> Add task
            </button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function InlineRow({
  task,
  assignableUsers,
  indent,
  expandControl,
  extra,
  autoFocusLabel,
}: {
  task: TaskItem;
  assignableUsers: Option[];
  indent: boolean;
  expandControl?: React.ReactNode;
  extra?: React.ReactNode;
  autoFocusLabel?: boolean;
}) {
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
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update reviewer");
      }
    });
  }

  return (
    <TableRow className={indent ? "bg-muted/30" : undefined}>
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
  return (
    <Fragment>
      <InlineRow
        task={task}
        assignableUsers={assignableUsers}
        indent={false}
        autoFocusLabel={task.id === autoFocusId}
        expandControl={
          task.subtasks.length > 0 ? (
            <button type="button" onClick={onToggleExpand} className="text-muted-foreground">
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="inline-block w-4" />
          )
        }
        extra={
          <Button variant="ghost" size="icon-sm" className="size-6 shrink-0" onClick={onAddSubtask}>
            <Plus className="size-3.5" />
          </Button>
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
