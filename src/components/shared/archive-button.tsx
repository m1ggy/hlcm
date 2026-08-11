"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";

// One button, two entity-agnostic actions — Project/Client/Application row
// actions and detail-page headers all pass their own archive/restore server
// action in and get the same confirm+toast+refresh behavior for free.
export function ArchiveButton({
  id,
  label,
  archived,
  archiveAction,
  restoreAction,
  variant = "icon",
}: {
  id: string;
  label: string;
  archived: boolean;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
  variant?: "icon" | "full";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!archived && !confirm(`Archive "${label}"? It'll drop out of the active lists but nothing is deleted — restore it anytime.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await (archived ? restoreAction(id) : archiveAction(id));
        toast.success(archived ? "Restored" : "Archived");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update");
      }
    });
  }

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        title={archived ? "Restore" : "Archive"}
        onClick={handleClick}
        disabled={isPending}
      >
        {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
