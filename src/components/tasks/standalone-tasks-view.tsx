"use client";

import { useEffect, useState } from "react";
import { StandaloneTaskRow } from "@/components/tasks/standalone-task-row";
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";
import { Option, TaskUserRef } from "@/components/tasks/task-types";

type StandaloneTask = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  recurrenceRule: string | null;
  assignedUser: TaskUserRef;
  isOverdue: boolean;
};

const FILTER_KEY = "hclm:tasks-filter";
type Filter = "all" | "overdue" | TaskStatusValue;

export function StandaloneTasksView({
  tasks,
  assignableUsers,
}: {
  tasks: StandaloneTask[];
  assignableUsers: Option[];
}) {
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const id = setTimeout(() => {
      const saved = window.localStorage.getItem(FILTER_KEY);
      if (saved) setFilter(saved as Filter);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function changeFilter(next: Filter) {
    setFilter(next);
    window.localStorage.setItem(FILTER_KEY, next);
  }

  const filtered = tasks.filter((task) => {
    if (filter === "all") return true;
    if (filter === "overdue") return task.isOverdue;
    return task.status === filter;
  });

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "overdue", label: "Overdue" },
    ...TASK_STATUSES.map((s) => ({ key: s, label: TASK_STATUS_LABELS[s] })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => changeFilter(chip.key)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filter === chip.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((task) => (
          <StandaloneTaskRow key={task.id} task={task} assignableUsers={assignableUsers} />
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No tasks match this filter.</p>}
      </div>
    </div>
  );
}
