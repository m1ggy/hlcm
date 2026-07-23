import { Badge } from "@/components/ui/badge";
import { TASK_STATUS_LABELS, TASK_STATUS_BADGE_VARIANT, TaskStatusValue } from "@/lib/task-status";

type TaskRow = {
  id: string;
  label: string;
  status: string;
  dueDate: Date | null;
  blockedReason: string | null;
  phaseId: string | null;
  subtasks: { id: string; label: string; status: string; dueDate: Date | null }[];
};

type PhaseRow = { id: string; name: string };

export function PortalChecklist({ phases, tasks }: { phases: PhaseRow[]; tasks: TaskRow[] }) {
  const byPhase = new Map<string | null, TaskRow[]>();
  for (const task of tasks) {
    const key = task.phaseId;
    byPhase.set(key, [...(byPhase.get(key) ?? []), task]);
  }

  const groups = phases.length > 0
    ? [...phases.map((p) => ({ id: p.id, name: p.name, tasks: byPhase.get(p.id) ?? [] })), { id: null, name: "Checklist", tasks: byPhase.get(null) ?? [] }].filter((g) => g.tasks.length > 0)
    : [{ id: null, name: "Checklist", tasks: byPhase.get(null) ?? [] }];

  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="space-y-6">
      {!hasAnyTasks && <p className="text-muted-foreground">No checklist items yet.</p>}
      {groups.map((group) => (
        <div key={group.id ?? "none"} className="space-y-2">
          {phases.length > 0 && <h3 className="text-sm font-medium">{group.name}</h3>}
          <div className="space-y-2">
            {group.tasks.map((task) => (
              <div key={task.id} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{task.label}</span>
                  <Badge variant={TASK_STATUS_BADGE_VARIANT[task.status as TaskStatusValue]}>
                    {TASK_STATUS_LABELS[task.status as TaskStatusValue]}
                  </Badge>
                </div>
                {task.dueDate && (
                  <p className="text-xs text-muted-foreground">
                    Due {new Date(task.dueDate).toLocaleDateString()}
                  </p>
                )}
                {task.status === "BLOCKED" && task.blockedReason && (
                  <p className="text-xs text-destructive">Blocked: {task.blockedReason}</p>
                )}
                {task.subtasks.length > 0 && (
                  <div className="ml-3 space-y-1 border-l pl-3 pt-1">
                    {task.subtasks.map((subtask) => (
                      <div key={subtask.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">{subtask.label}</span>
                        <Badge variant={TASK_STATUS_BADGE_VARIANT[subtask.status as TaskStatusValue]}>
                          {TASK_STATUS_LABELS[subtask.status as TaskStatusValue]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
