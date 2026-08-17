"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { changeApplicationStage } from "@/lib/actions/stage";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Card } from "@/components/ui/card";
import { TaskProgress } from "@/components/applications/task-progress";
import { ApplicationFlags } from "@/components/applications/application-flags";

export type BoardStage = { id: string; abbrev: string; name: string; hex: string; sortOrder: number };

type AppCard = {
  id: string;
  name: string;
  stageId: string;
  client: { name: string };
  assignedUser: { name: string };
  taskProgress: { total: number; done: number };
  readyToSubmit: boolean;
  staleDays: number | null;
};

function StageChip({ stage }: { stage: BoardStage }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: stage.hex, color: "#fff" }}
    >
      {stage.abbrev}
    </span>
  );
}

function KanbanCardBody({ card, dragging = false }: { card: AppCard; dragging?: boolean }) {
  return (
    <Card className={`gap-2 p-3 ${dragging ? "cursor-grabbing shadow-lg" : "cursor-grab"}`}>
      <Link href={`/applications/${card.id}`} className="font-medium hover:underline" onClick={(e) => dragging && e.preventDefault()}>
        {card.name}
      </Link>
      <p className="text-xs text-muted-foreground">{card.client.name}</p>
      <TaskProgress total={card.taskProgress.total} done={card.taskProgress.done} />
      <ApplicationFlags readyToSubmit={card.readyToSubmit} staleDays={card.staleDays} />
      <div className="flex items-center gap-1.5 pt-1">
        <AvatarInitials name={card.assignedUser.name} className="size-5 text-[0.6rem]" />
        <span className="text-xs text-muted-foreground">{card.assignedUser.name}</span>
      </div>
    </Card>
  );
}

// Same drag-overlay-clone approach as the legacy status board (applications-board.tsx)
// — dnd-kit's own sortable transform only repositions within the source
// column's layout, so without a DragOverlay it visually stalls crossing
// into a different column.
function KanbanCard({ card }: { card: AppCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardBody card={card} />
    </div>
  );
}

function KanbanColumn({ stage, cards }: { stage: BoardStage; cards: AppCard[] }) {
  const { setNodeRef } = useDroppable({ id: `column:${stage.id}` });

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <StageChip stage={stage} />
        <span className="text-xs text-muted-foreground">{cards.length}</span>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2 rounded-lg bg-muted/30 p-2">
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// Stage-driven counterpart to ApplicationsBoard (applications-board.tsx,
// which still drives the legacy "No Pipeline" tab off the old status enum).
// One board per pipeline — columns are that pipeline's own non-exit stages,
// never a flat cross-pipeline list (docs/pipeline-stage-plan.md: CILA alone
// has 24 stages, Home Care 7 — a single shared board can't sanely show both).
export function PipelineApplicationsBoard({ applications, stages }: { applications: AppCard[]; stages: BoardStage[] }) {
  const [items, setItems] = useState(applications);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const columns = stages.map((stage) => ({
    stage,
    cards: items.filter((a) => a.stageId === stage.id),
  }));
  const activeCard = activeId ? items.find((a) => a.id === activeId) ?? null : null;

  function resolveTargetStageId(overId: string): string | null {
    if (overId.startsWith("column:")) return overId.replace("column:", "");
    const overCard = items.find((a) => a.id === overId);
    return overCard?.stageId ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeCard = items.find((a) => a.id === active.id);
    if (!activeCard) return;

    const targetStageId = resolveTargetStageId(String(over.id));
    if (!targetStageId || targetStageId === activeCard.stageId) return;

    const previousItems = items;
    setItems((prev) => prev.map((a) => (a.id === activeCard.id ? { ...a, stageId: targetStageId } : a)));

    changeApplicationStage(activeCard.id, targetStageId).catch((error) => {
      setItems(previousItems);
      toast.error(error instanceof Error ? error.message : "Failed to move stage");
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn key={col.stage.id} stage={col.stage} cards={col.cards} />
        ))}
      </div>
      <DragOverlay>{activeCard && <KanbanCardBody card={activeCard} dragging />}</DragOverlay>
    </DndContext>
  );
}
