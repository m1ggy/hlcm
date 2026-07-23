"use client";

import { MoreVertical, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TaskRowMenu({
  onDelete,
  isDeleting,
  subtaskCount,
}: {
  onDelete: () => void;
  isDeleting: boolean;
  subtaskCount: number;
}) {
  function handleDeleteClick() {
    const message =
      subtaskCount > 0
        ? `This task has ${subtaskCount} subtask${subtaskCount === 1 ? "" : "s"} — deleting it deletes ${subtaskCount === 1 ? "that subtask" : "them"} too. This can't be undone.`
        : "Delete this task? This can't be undone.";
    if (!confirm(message)) return;
    onDelete();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" disabled={isDeleting} title="Task actions">
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onClick={handleDeleteClick}>
          <Trash2 className="size-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
