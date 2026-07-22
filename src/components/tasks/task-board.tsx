"use client";

import { TaskTable } from "./task-table";
import { TaskItem, Option } from "./task-types";

type PhaseRef = { id: string; name: string; sortOrder: number };

export function TaskBoard({
  applicationId,
  phases,
  tasks,
  assignableUsers,
  defaultAssignedUserId,
}: {
  applicationId: string;
  phases: PhaseRef[];
  tasks: TaskItem[];
  assignableUsers: Option[];
  defaultAssignedUserId: string;
}) {
  const tasksByPhase = new Map<string | null, TaskItem[]>();
  for (const task of tasks) {
    const key = task.phaseId;
    if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
    tasksByPhase.get(key)!.push(task);
  }

  const generalTasks = tasksByPhase.get(null) ?? [];

  return (
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
        />
      </div>
    </div>
  );
}
