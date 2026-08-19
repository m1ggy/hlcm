"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_BADGE_VARIANT, TaskStatusValue } from "@/lib/task-status";

/**
 * Status <Select> shared by the checklist table, My Tasks cards, and the
 * task detail sheet — trigger shows the same colored badge as the dropdown
 * options so a status reads at a glance instead of as plain text.
 */
export function TaskStatusSelect({
  value,
  onValueChange,
  size = "sm",
  className,
}: {
  value: TaskStatusValue;
  onValueChange: (next: TaskStatusValue) => void;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Select
      items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]]))}
      value={value}
      onValueChange={(v) => onValueChange((v ?? value) as TaskStatusValue)}
    >
      <SelectTrigger size={size} className={className}>
        <SelectValue>
          {(v: string) => (
            <Badge variant={TASK_STATUS_BADGE_VARIANT[v as TaskStatusValue]}>
              {TASK_STATUS_LABELS[v as TaskStatusValue]}
            </Badge>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <Badge variant={TASK_STATUS_BADGE_VARIANT[s]}>{TASK_STATUS_LABELS[s]}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
