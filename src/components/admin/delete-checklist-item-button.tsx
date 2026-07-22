"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteChecklistItemTemplate } from "@/lib/actions/checklist-templates";
import { Button } from "@/components/ui/button";

export function DeleteChecklistItemButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Delete this checklist item template? Applications already created won't be affected.")) return;
    startTransition(async () => {
      try {
        await deleteChecklistItemTemplate(id);
        toast.success("Checklist item deleted");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
      Delete
    </Button>
  );
}
