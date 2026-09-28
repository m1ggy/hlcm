"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { currentOrganization } from "@/lib/db";
import { updateOrganizationSettings } from "@/lib/tenant";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";

// Admin > Organization: the workspace's own name (shown in the sidebar,
// emails, PDFs, the sign-in page) and timezone (when org-wide schedules
// like the 8am digest run). Owners only, like Integrations.

const OWNER_ONLY = ["OWNER"] as const;

export async function getOrganizationSettings() {
  await requireRole([...OWNER_ONLY]);
  const org = await currentOrganization();
  return { name: org.name, slug: org.slug, timezone: org.timezone, replyToEmail: org.replyToEmail };
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Keep the name under 80 characters"),
  timezone: z.string().nullable(),
  replyToEmail: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.string().email("Enter a valid reply-to email").nullable()),
});

export async function saveOrganizationSettings(input: { name: string; timezone: string | null; replyToEmail: string }): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireRole([...OWNER_ONLY]);
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);
    const { name, timezone, replyToEmail } = parsed.data;
    if (timezone !== null && !Intl.supportedValuesOf("timeZone").includes(timezone)) {
      throw new UserFacingError("Unrecognized timezone");
    }

    const before = await currentOrganization();
    await updateOrganizationSettings(before.id, { name, timezone, replyToEmail });
    for (const [field, oldValue, newValue] of [
      ["name", before.name, name],
      ["timezone", before.timezone, timezone],
      ["replyToEmail", before.replyToEmail, replyToEmail],
    ] as const) {
      if (oldValue !== newValue) {
        await recordAudit({ entityType: "Organization", entityId: before.id, action: "update", actorId: session.user.id, field, oldValue, newValue });
      }
    }
    revalidatePath("/", "layout");
  });
}
