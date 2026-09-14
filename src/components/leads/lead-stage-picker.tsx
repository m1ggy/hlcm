"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeLeadStage } from "@/lib/actions/leads";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { $Enums } from "@/generated/prisma/client";

// One dropdown of all 8 stages, used instead of bespoke per-stage buttons —
// any stage can move to any other stage, no whitelist (see LeadStage in
// prisma/schema.prisma). NO_SHOW/MISSED are attendance tracking's whole
// UI — landing on either one auto-creates a follow-up Task, see
// changeLeadStage in src/lib/actions/leads.ts.
export const LEAD_STAGE_LABELS: Record<$Enums.LeadStage, string> = {
  BOOKED: "Booked",
  HELD: "Held",
  NO_SHOW: "No-show",
  MISSED: "Missed",
  FOLLOW_UP_SENT: "Follow-up sent",
  REBOOKED: "Rebooked",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export function LeadStagePicker({ leadId, stage }: { leadId: string; stage: $Enums.LeadStage }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string | null) {
    if (!next || next === stage) return;
    startTransition(async () => {
      try {
        await changeLeadStage(leadId, next as $Enums.LeadStage);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update stage");
      }
    });
  }

  return (
    <Select value={stage} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-[10rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LEAD_STAGE_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
