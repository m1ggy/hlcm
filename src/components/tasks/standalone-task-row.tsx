"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { updateTask, deleteTask } from "@/lib/actions/tasks";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_BADGE_VARIANT } from "@/lib/task-status";
import { Option, TaskUserRef } from "./task-types";

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
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function StandaloneTaskRow({
  task,
  assignableUsers,
  currentUserId,
}: {
  task: StandaloneTask;
  assignableUsers: Option[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState(task.status);
  const [assignedUserId, setAssignedUserId] = useState(task.assignedUser.id);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [blockedReason, setBlockedReason] = useState(task.blockedReason ?? "");

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

  function handleDelete() {
    if (!confirm("Delete this task? This can't be undone.")) return;
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete task");
      }
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[10rem] flex-1 font-medium">{task.label}</span>
        {task.recurrenceRule && <Badge variant="outline">Repeats {task.recurrenceRule}</Badge>}
        {(task.createdById === currentUserId || task.assignedUser.id === currentUserId) && (
          <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete task">
            <Trash2 className="size-3.5" />
          </Button>
        )}
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
    </div>
  );
}
