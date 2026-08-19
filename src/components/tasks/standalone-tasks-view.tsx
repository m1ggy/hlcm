"use client";

import { useEffect, useState } from "react";
import { MyTaskRow } from "@/components/tasks/standalone-task-row";
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";
import { Option, TaskUserRef } from "@/components/tasks/task-types";

type Subtask = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  assignedUser: TaskUserRef;
};

type MyTask = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  recurrenceRule: string | null;
  createdById: string;
  assignedUser: TaskUserRef;
  subtasks: Subtask[];
  isOverdue: boolean;
  // Which case this task is from — null for standalone tasks (internal
  // errands not tied to any client case).
  application: { id: string; name: string; client: { name: string } } | null;
};

const FILTER_KEY = "hclm:tasks-filter";
type Filter = "all" | "overdue" | TaskStatusValue;

export function MyTasksView({
  tasks,
  assignableUsers,
}: {
  tasks: MyTask[];
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

  // Overdue first, then soonest due date, then no-due-date tasks last — so
  // what needs attention today doesn't get buried under createdAt order.
  const filtered = tasks
    .filter((task) => {
      if (filter === "all") return true;
      if (filter === "overdue") return task.isOverdue;
      return task.status === filter;
    })
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: tasks.length },
    { key: "overdue", label: "Overdue", count: tasks.filter((t) => t.isOverdue).length },
    ...TASK_STATUSES.map((s) => ({
      key: s,
      label: TASK_STATUS_LABELS[s],
      count: tasks.filter((t) => t.status === s).length,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => changeFilter(chip.key)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filter === chip.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            } ${chip.key === "overdue" && chip.count > 0 && filter !== chip.key ? "border-destructive/40 text-destructive" : ""}`}
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((task) => (
          <MyTaskRow key={task.id} task={task} assignableUsers={assignableUsers} />
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No tasks match this filter.</p>}
      </div>
    </div>
  );
}
