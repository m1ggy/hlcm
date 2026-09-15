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
  assignedTo,
  users,
}: {
  leadId: string;
  assignedTo: { id: string; name: string } | null;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const assignedToId = assignedTo?.id ?? null;

  // `users` is only the currently-active assignable pool (listAssignableUsers)
  // — if this lead's assignee was deactivated (or otherwise dropped out of
  // that pool) after being assigned, they'd have no matching SelectItem, and
  // base-ui's Select falls back to rendering the raw value — the user's id
  // — since it has no label to resolve it to. Folding the current assignee
  // in here (using the name Leads' own query already returned, not a
  // lookup against `users`) keeps that case showing a real name.
  const options = assignedTo && !users.some((u) => u.id === assignedTo.id) ? [...users, assignedTo] : users;

  function handleChange(next: string | null) {
    if (next == null) return;
    const userId = next === NONE ? null : next;
    if (userId === assignedToId) return;
    startTransition(async () => {
      try {
        await assignLead(leadId, userId);
        toast.success(userId ? `Assigned to ${options.find((u) => u.id === userId)?.name}` : "Unassigned");
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
        {options.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
