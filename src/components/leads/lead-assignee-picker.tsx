"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignLead } from "@/lib/actions/leads";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

// Who follows up on this booking — drives the meeting-reminder notify()/
// Teams post (src/lib/meeting-reminders.ts). Same Select API and NONE-
// sentinel pattern as the "Assigned VA" picker on
// application-properties-table.tsx.
export function LeadAssigneePicker({
  leadId,
  assignedToId,
  users,
}: {
  leadId: string;
  assignedToId: string | null;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string | null) {
    if (next == null) return;
    const userId = next === NONE ? null : next;
    if (userId === assignedToId) return;
    startTransition(async () => {
      try {
        await assignLead(leadId, userId);
        toast.success(userId ? `Assigned to ${users.find((u) => u.id === userId)?.name}` : "Unassigned");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update assignee");
      }
    });
  }

  return (
    <Select value={assignedToId ?? NONE} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-[11rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
