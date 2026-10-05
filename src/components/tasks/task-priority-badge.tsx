import { TASK_PRIORITY_CLASS, TASK_PRIORITY_LABELS, type TaskPriorityValue } from "@/lib/task-status";
import { cn } from "@/lib/utils";

export function TaskPriorityBadge({ priority }: { priority: TaskPriorityValue | null }) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TASK_PRIORITY_CLASS[priority])}>
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}
