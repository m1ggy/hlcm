"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { updateTask, createStandaloneTask } from "@/lib/actions/tasks";
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
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_BADGE_VARIANT } from "@/lib/task-status";
import { TaskDetailDialog } from "./task-detail-dialog";
import { Option, TaskUserRef } from "./task-types";

type Subtask = {
  id: string;
  label: string;
  description: string | null;
  status: (typeof TASK_STATUSES)[number];
  dueDate: Date | null;
  blockedReason: string | null;
  assignedUser: TaskUserRef;
};

type StandaloneTask = {
  id: string;
  label: string;
  description: string | null;
  status: (typeof TASK_STATUSES)[number];
  dueDate: Date | null;
  blockedReason: string | null;
  recurrenceRule: string | null;
  createdById: string;
  assignedUser: TaskUserRef;
  subtasks: Subtask[];
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function StandaloneTaskRow({
  task,
  assignableUsers,
}: {
  task: StandaloneTask;
  assignableUsers: Option[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [status, setStatus] = useState(task.status);
  const [assignedUserId, setAssignedUserId] = useState(task.assignedUser.id);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? "");
  const [expanded, setExpanded] = useState(false);

  function save(overrides: Partial<{ status: string; assignedUserId: string; dueDate: string; blockedReason: string }>) {
    const formData = new FormData();
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

  function addSubtask() {
    const formData = new FormData();
    formData.set("label", "New subtask");
    formData.set("assignedUserId", task.assignedUser.id);
    formData.set("parentTaskId", task.id);
    startAdding(async () => {
      try {
        await createStandaloneTask(formData);
        setExpanded(true);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add subtask");
      }
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {task.subtasks.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground"
            title={expanded ? "Collapse subtasks" : "Expand subtasks"}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <span className="min-w-[10rem] flex-1 font-medium">{task.label}</span>
        {task.recurrenceRule && <Badge variant="outline">Repeats {task.recurrenceRule}</Badge>}
        <Button variant="ghost" size="icon-sm" className="size-6" onClick={addSubtask} disabled={isAdding} title="Add subtask">
          {isAdding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        </Button>
        <TaskDetailDialog
          taskId={task.id}
          label={task.label}
          description={task.description}
          status={task.status}
          dueDate={task.dueDate}
          blockedReason={task.blockedReason}
          assignedUserId={task.assignedUser.id}
          reviewerId={null}
          hasReviewer={false}
          assignableUsers={assignableUsers}
        />
        <Select
          items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]]))}
          value={status}
          onValueChange={(v) => {
            const next = (v ?? status) as typeof status;
            setStatus(next);
            save({ status: next });
          }}
        >
          <SelectTrigger className="w-[9.5rem]" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                <Badge variant={TASK_STATUS_BADGE_VARIANT[s]}>{TASK_STATUS_LABELS[s]}</Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            save({ dueDate: e.target.value });
          }}
          className="w-[9.5rem]"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Assigned:</span>
        <Select
          items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
          value={assignedUserId}
          onValueChange={(v) => {
            const next = v ?? assignedUserId;
            setAssignedUserId(next);
            save({ assignedUserId: next });
          }}
        >
          <SelectTrigger size="sm" className="w-[10rem]">
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
      </div>

      {status === "BLOCKED" && (
        <div className="mt-2">
          <Input
            placeholder="What/who is this blocked on?"
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            onBlur={() => save({ blockedReason })}
            className="text-sm"
          />
        </div>
      )}

      {expanded && task.subtasks.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {task.subtasks.map((subtask) => (
            <SubtaskRow key={subtask.id} subtask={subtask} assignableUsers={assignableUsers} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ subtask, assignableUsers }: { subtask: Subtask; assignableUsers: Option[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState(subtask.status);
  const [assignedUserId, setAssignedUserId] = useState(subtask.assignedUser.id);
  const [dueDate, setDueDate] = useState(toDateInputValue(subtask.dueDate));

  function save(overrides: Partial<{ status: string; assignedUserId: string; dueDate: string }>) {
    const formData = new FormData();
    formData.set("status", overrides.status ?? status);
    formData.set("assignedUserId", overrides.assignedUserId ?? assignedUserId);
    formData.set("dueDate", overrides.dueDate ?? dueDate);
    startTransition(async () => {
      try {
        await updateTask(subtask.id, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update subtask");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-2 pl-8 text-sm">
      <span className="min-w-[9rem] flex-1">{subtask.label}</span>
      <TaskDetailDialog
        taskId={subtask.id}
        label={subtask.label}
        description={subtask.description}
        status={subtask.status}
        dueDate={subtask.dueDate}
        blockedReason={subtask.blockedReason}
        assignedUserId={subtask.assignedUser.id}
        reviewerId={null}
        hasReviewer={false}
        assignableUsers={assignableUsers}
      />
      <Select
        items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]]))}
        value={status}
        onValueChange={(v) => {
          const next = (v ?? status) as typeof status;
          setStatus(next);
          save({ status: next });
        }}
      >
        <SelectTrigger className="w-[9rem]" size="sm">
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
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => {
          setDueDate(e.target.value);
          save({ dueDate: e.target.value });
        }}
        className="w-[9rem]"
      />
    </div>
  );
}
