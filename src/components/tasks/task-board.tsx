"use client";

import { useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskTable } from "./task-table";
import { TasksKanbanBoard } from "./tasks-kanban-board";
import { TaskItem, Option } from "./task-types";

type PhaseRef = { id: string; name: string; sortOrder: number };

export function TaskBoard({
  applicationId,
  phases,
  tasks,
  assignableUsers,
  defaultAssignedUserId,
  currentUserId,
}: {
  applicationId: string;
  phases: PhaseRef[];
  tasks: TaskItem[];
  assignableUsers: Option[];
  defaultAssignedUserId: string;
  currentUserId: string;
}) {
  const [view, setView] = useState<"list" | "board">("list");

  const tasksByPhase = new Map<string | null, TaskItem[]>();
  for (const task of tasks) {
    const key = task.phaseId;
    if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
    tasksByPhase.get(key)!.push(task);
  }

  const generalTasks = tasksByPhase.get(null) ?? [];
  const phaseNameById = new Map(phases.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs w-fit">
        <Button variant={view === "list" ? "default" : "ghost"} size="xs" onClick={() => setView("list")}>
          <List className="size-3.5" /> List
        </Button>
        <Button variant={view === "board" ? "default" : "ghost"} size="xs" onClick={() => setView("board")}>
          <LayoutGrid className="size-3.5" /> Board
        </Button>
      </div>

      {view === "board" ? (
        <TasksKanbanBoard
          tasks={tasks.map((t) => ({ ...t, phaseName: t.phaseId ? (phaseNameById.get(t.phaseId) ?? null) : null }))}
        />
      ) : (
        <div className="space-y-6">
          {phases.map((phase) => (
            <div key={phase.id} className="space-y-2">
              <h3 className="font-medium">{phase.name}</h3>
              <TaskTable
                applicationId={applicationId}
                phaseId={phase.id}
                tasks={tasksByPhase.get(phase.id) ?? []}
                assignableUsers={assignableUsers}
                defaultAssignedUserId={defaultAssignedUserId}
                currentUserId={currentUserId}
              />
            </div>
          ))}

          <div className="space-y-2">
            <h3 className="font-medium">{phases.length > 0 ? "General" : "Tasks"}</h3>
            <TaskTable
              applicationId={applicationId}
              phaseId={null}
              tasks={generalTasks}
              assignableUsers={assignableUsers}
              defaultAssignedUserId={defaultAssignedUserId}
              currentUserId={currentUserId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
