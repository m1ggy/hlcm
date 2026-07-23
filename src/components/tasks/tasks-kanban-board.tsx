"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { updateTask } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_BADGE_VARIANT, TaskStatusValue } from "@/lib/task-status";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TaskItem } from "./task-types";

type BoardTask = TaskItem & { phaseName: string | null };

function KanbanCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : undefined };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="cursor-grab gap-2 p-3 active:cursor-grabbing">
        <p className="text-sm font-medium">{task.label}</p>
        {task.phaseName && <p className="text-xs text-muted-foreground">{task.phaseName}</p>}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <AvatarInitials name={task.assignedUser.name} className="size-5 text-[0.6rem]" />
            <span className="text-xs text-muted-foreground">{task.assignedUser.name}</span>
          </div>
          {task.dueDate && (
            <span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString()}</span>
          )}
        </div>
      </Card>
    </div>
  );
}

function KanbanColumn({ status, tasks }: { status: TaskStatusValue; tasks: BoardTask[] }) {
  const { setNodeRef } = useDroppable({ id: `column:${status}` });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <Badge variant={TASK_STATUS_BADGE_VARIANT[status]}>{TASK_STATUS_LABELS[status]}</Badge>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2 rounded-lg bg-muted/30 p-2">
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function TasksKanbanBoard({ tasks }: { tasks: BoardTask[] }) {
  const [items, setItems] = useState(tasks);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: items.filter((t) => t.status === status),
  }));

  function resolveTargetStatus(overId: string): TaskStatusValue | null {
    if (overId.startsWith("column:")) return overId.replace("column:", "") as TaskStatusValue;
    const overTask = items.find((t) => t.id === overId);
    return overTask?.status ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeTask = items.find((t) => t.id === active.id);
    if (!activeTask) return;

    const targetStatus = resolveTargetStatus(String(over.id));
    if (!targetStatus || targetStatus === activeTask.status) return;

    const previousItems = items;
    setItems((prev) => prev.map((t) => (t.id === activeTask.id ? { ...t, status: targetStatus } : t)));

    const formData = new FormData();
    formData.set("status", targetStatus);
    updateTask(activeTask.id, formData).catch((error) => {
      setItems(previousItems);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn key={col.status} status={col.status} tasks={col.tasks} />
        ))}
      </div>
    </DndContext>
  );
}
