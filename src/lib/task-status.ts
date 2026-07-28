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
