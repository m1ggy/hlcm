"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { currentOrganization } from "@/lib/db";
import { updateMonitoringSettings } from "@/lib/tenant";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";

// Admin > Organization > Activity monitoring (docs/activity-monitoring-plan.md):
// the owner switches the add-on on or off and may write the workspace's own
// notice. Only once the platform has granted the add-on.

const schema = z.object({
  enabled: z.boolean(),
  policy: z
    .string()
    .trim()
    .max(8000, "Keep the notice under 8,000 characters")
    .transform((v) => v || null),
});

export async function saveMonitoringSettings(input: { enabled: boolean; policy: string }): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireRole(["OWNER"]);
    const org = await currentOrganization();
    if (!org.activityMonitoringAddon) throw new UserFacingError("Activity monitoring isn't part of this workspace's plan");
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);
    const { enabled, policy } = parsed.data;

    const { policyChanged } = await updateMonitoringSettings(org.id, { activityMonitoringEnabled: enabled, monitoringPolicy: policy });
    if (enabled !== org.activityMonitoringEnabled) {
      await recordAudit({
        entityType: "Organization",
        entityId: org.id,
        action: "update",
        actorId: session.user.id,
        field: "activityMonitoringEnabled",
        oldValue: String(org.activityMonitoringEnabled),
        newValue: String(enabled),
      });
    }
    if (policyChanged) {
      await recordAudit({ entityType: "Organization", entityId: org.id, action: "update", actorId: session.user.id, field: "monitoringPolicy", newValue: policy ?? "(default)" });
    }
    revalidatePath("/", "layout");
  });
}
