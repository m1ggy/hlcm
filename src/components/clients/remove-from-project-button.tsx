"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeClientFromProject } from "@/lib/actions/clients";

// Undoes an import (or a client linked into the wrong project) — separate
// from archiving, which takes the client out of every project at once.
export function RemoveFromProjectButton({ clientId, clientName, projectId }: { clientId: string; clientName: string; projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Remove "${clientName}" from this project? It'll stay linked to any other project it's part of.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await removeClientFromProject(clientId, projectId);
        toast.success("Client removed from project");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove client");
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" title="Remove from project" onClick={handleClick} disabled={isPending}>
      <XIcon className="size-3.5" />
    </Button>
  );
}
