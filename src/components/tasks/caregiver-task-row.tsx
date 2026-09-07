"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { updateTask } from "@/lib/actions/tasks";
import { isTaskOverdue, TaskStatusValue } from "@/lib/task-status";
import { TaskStatusSelect } from "./task-status-select";
import { TaskDetailDialog } from "./task-detail-dialog";

type CaregiverTask = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  assignees: { user: { id: string; name: string } }[];
  applicationName: string;
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

// Status + notes only — same restriction TaskDetailDialog's isCaregiver
// mode enforces for the "My Tasks" page, reused here on the Caregiver's
// client-profile view so a task looks and behaves the same in both places.
export function CaregiverTaskRow({ task }: { task: CaregiverTask }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(task.status);
  const dueDateValue = toDateInputValue(task.dueDate);
  const overdue = isTaskOverdue(dueDateValue, status);
  const assignedUserIds = task.assignees.map((a) => a.user.id);
  const assignableUsers = task.assignees.map((a) => a.user);

  function saveStatus(next: TaskStatusValue) {
    setStatus(next);
    const formData = new FormData();
    formData.set("status", next);
    startTransition(async () => {
      try {
        await updateTask(task.id, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      }
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${overdue ? "border-destructive/40" : ""}`}>
      <span className="min-w-[10rem] flex-1 font-medium">{task.label}</span>
      <Badge variant="outline" className="text-muted-foreground">
        {task.applicationName}
      </Badge>
      {overdue && <Badge variant="destructive">Overdue</Badge>}
      <TaskDetailDialog
        taskId={task.id}
        label={task.label}
        description={task.description}
        status={task.status}
        dueDate={task.dueDate}
        blockedReason={task.blockedReason}
        assignedUserIds={assignedUserIds}
        reviewerIds={[]}
        hasReviewer={false}
        assignableUsers={assignableUsers}
        isCaregiver
      />
      <div className={status === "COMPLETED" ? "-m-1 rounded-lg bg-emerald-500/10 p-1 dark:bg-emerald-500/15" : undefined}>
        <TaskStatusSelect value={status} onValueChange={saveStatus} className="w-40" loading={isPending} />
      </div>
    </div>
  );
}
