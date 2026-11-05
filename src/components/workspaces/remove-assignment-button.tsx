"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { removeAssignment } from "@/lib/actions/workspaces";
import { Button } from "@/components/ui/button";

export function RemoveAssignmentButton({ assignmentId, name, workspaceName }: { assignmentId: string; name: string; workspaceName: string }) {
  const [isPending, startTransition] = useTransition();
  function remove() {
    if (!confirm(`Remove ${name} from ${workspaceName}? They lose access right away; what they did there stays.`)) return;
    startTransition(async () => {
      const result = await removeAssignment(assignmentId);
      if (result.ok) toast.success(`${name} removed from ${workspaceName}`);
      else toast.error(result.error);
    });
  }
  return (
    <Button variant="ghost" size="sm" onClick={remove} loading={isPending}>
      Remove
    </Button>
  );
}
