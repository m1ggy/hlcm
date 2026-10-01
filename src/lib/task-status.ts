export const TASK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "NA", "CLOSED"] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatusValue, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  NA: "N/A",
  CLOSED: "Closed",
};

export const TASK_STATUS_BADGE_VARIANT: Record<
  TaskStatusValue,
  "default" | "secondary" | "destructive" | "outline"
> = {
  NOT_STARTED: "outline",
  IN_PROGRESS: "secondary",
  BLOCKED: "destructive",
  COMPLETED: "default",
  NA: "outline",
  CLOSED: "secondary",
};

// Terminal states — task is done and out of the active cycle. Used to keep
// these off overdue/workload counts the same way COMPLETED/NA already are.
export const TASK_CLOSED_STATUSES = ["COMPLETED", "NA", "CLOSED"] as const;

// Optional (Task.priority is nullable) — tasks created before priorities
// existed simply have none.
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const TASK_PRIORITY_CLASS: Record<TaskPriorityValue, string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  HIGH: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/**
 * Client-side mirror of the overdue check listStandaloneTasks() does on the
 * server — recomputed from local state so a status/due-date edit updates the
 * "Overdue" flag immediately instead of waiting on router.refresh().
 */
export function isTaskOverdue(dueDate: string | Date | null, status: TaskStatusValue) {
  if (!dueDate) return false;
  if (TASK_CLOSED_STATUSES.includes(status as (typeof TASK_CLOSED_STATUSES)[number])) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.getTime() < Date.now();
}
