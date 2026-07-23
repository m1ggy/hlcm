"use client";

import { useState } from "react";
import Link from "next/link";
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
import { updateApplicationStatus } from "@/lib/actions/applications";
import { APPLICATION_STATUSES, STATUS_LABELS, STATUS_BADGE_VARIANT, ApplicationStatus } from "@/lib/status";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AppCard = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  assignedUser: { name: string };
};

function KanbanCard({ card }: { card: AppCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="cursor-grab gap-2 p-3 active:cursor-grabbing">
        <Link href={`/applications/${card.id}`} className="font-medium hover:underline" onClick={(e) => isDragging && e.preventDefault()}>
          {card.name}
        </Link>
        <p className="text-xs text-muted-foreground">{card.client.name}</p>
        <div className="flex items-center gap-1.5 pt-1">
          <AvatarInitials name={card.assignedUser.name} className="size-5 text-[0.6rem]" />
          <span className="text-xs text-muted-foreground">{card.assignedUser.name}</span>
        </div>
      </Card>
    </div>
  );
}

function KanbanColumn({ status, cards }: { status: ApplicationStatus; cards: AppCard[] }) {
  const { setNodeRef } = useDroppable({ id: `column:${status}` });

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
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

export function ApplicationsBoard({ applications }: { applications: AppCard[] }) {
  const [items, setItems] = useState(applications);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const columns = APPLICATION_STATUSES.map((status) => ({
    status,
    cards: items.filter((a) => a.status === status),
  }));

  function resolveTargetStatus(overId: string): ApplicationStatus | null {
    if (overId.startsWith("column:")) return overId.replace("column:", "") as ApplicationStatus;
    const overCard = items.find((a) => a.id === overId);
    return (overCard?.status as ApplicationStatus) ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeCard = items.find((a) => a.id === active.id);
    if (!activeCard) return;

    const targetStatus = resolveTargetStatus(String(over.id));
    if (!targetStatus || targetStatus === activeCard.status) return;

    const previousItems = items;
    setItems((prev) => prev.map((a) => (a.id === activeCard.id ? { ...a, status: targetStatus } : a)));

    updateApplicationStatus(activeCard.id, targetStatus).catch((error) => {
      setItems(previousItems);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn key={col.status} status={col.status} cards={col.cards} />
        ))}
      </div>
    </DndContext>
  );
}
