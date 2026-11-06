import { cn } from "@/lib/utils";
import { WORK_TASK_PRIORITY_LABELS, WORK_TASK_STATUS_LABELS, type WorkTaskPriority, type WorkTaskStatus } from "@/lib/work";

// Task status as a dot plus the fixed word (Carenela design system,
// StatusPill): the word always shows, so color never carries it alone.
// To do has a hollow dot and Cancelled is struck through.
const DOT: Record<WorkTaskStatus, string> = {
  TODO: "border-2 border-slate-500 dark:border-slate-400",
  IN_PROGRESS: "bg-teal-600 dark:bg-teal-400",
  IN_REVIEW: "bg-violet-600 dark:bg-violet-400",
  BLOCKED: "bg-orange-600 dark:bg-orange-400",
  DONE: "bg-green-700 dark:bg-green-400",
  CANCELLED: "bg-slate-400",
};

const TEXT: Record<WorkTaskStatus, string> = {
  TODO: "text-slate-600 dark:text-slate-300",
  IN_PROGRESS: "text-teal-700 dark:text-teal-300",
  IN_REVIEW: "text-violet-700 dark:text-violet-300",
  BLOCKED: "text-orange-700 dark:text-orange-300",
  DONE: "text-green-700 dark:text-green-300",
  CANCELLED: "text-muted-foreground line-through",
};

export function StatusDot({ status, className }: { status: WorkTaskStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[status], className)} />;
}

export function WorkStatusPill({ status, className }: { status: WorkTaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold", TEXT[status], className)}>
      <StatusDot status={status} />
      {WORK_TASK_STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_TEXT: Record<WorkTaskPriority, string> = {
  LOW: "text-muted-foreground",
  NORMAL: "text-muted-foreground",
  HIGH: "text-orange-700 dark:text-orange-300",
  URGENT: "text-red-700 dark:text-red-300 font-semibold",
};

/** Only High and Urgent are worth a label in lists. */
export function PriorityLabel({ priority, always = false }: { priority: WorkTaskPriority; always?: boolean }) {
  if (!always && (priority === "LOW" || priority === "NORMAL")) return null;
  return <span className={cn("text-xs", PRIORITY_TEXT[priority])}>{WORK_TASK_PRIORITY_LABELS[priority]}</span>;
}

export function formatDay(day: string | Date | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  if (!day) return null;
  const iso = typeof day === "string" ? day.slice(0, 10) : day.toISOString().slice(0, 10);
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
