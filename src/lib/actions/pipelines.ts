"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentOrganization, db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { updatePipelineSettings } from "@/lib/tenant";
import { PIPELINES, pipelineLabels, visiblePipelines, type PipelineSettings } from "@/lib/pipeline-labels";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";

// Each workspace's names for the three pipelines, and which ones it hides
// (Admin > License Types). Hiding only takes a pipeline out of the
// Applications tabs and the license-type picker — so it's refused while
// open cases or license types still use it.

export async function getPipelineConfig() {
  await requireSession();
  const settings = ((await currentOrganization()).pipelineSettings ?? {}) as PipelineSettings;
  return { settings, labels: pipelineLabels(settings), visible: visiblePipelines(settings) };
}

const schema = z.array(
  z.object({
    pipeline: z.enum(PIPELINES as [string, ...string[]]),
    label: z.string().trim().max(40, "Keep pipeline names under 40 characters"),
    hidden: z.boolean(),
  })
);

export async function savePipelineSettings(input: { pipeline: string; label: string; hidden: boolean }[]): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireRole(["ADMIN"]);
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);
    if (parsed.data.every((p) => p.hidden)) throw new UserFacingError("Keep at least one pipeline visible");

    const org = await currentOrganization();
    const before = (org.pipelineSettings ?? {}) as PipelineSettings;
    const defaults = pipelineLabels(null);
    const next: PipelineSettings = {};
    for (const { pipeline, label, hidden } of parsed.data) {
      const key = pipeline as keyof typeof defaults;
      if (hidden && !before[key]?.hidden) {
        const [cases, licenseTypes] = await Promise.all([
          // The MCO tab also lists cases with no pipeline at all (legacy rows).
          db.application.count({ where: { active: true, ...(key === "MCO" ? { OR: [{ pipeline: key }, { pipeline: null }] } : { pipeline: key }) } }),
          db.licenseTypeTemplate.count({ where: { pipeline: key, active: true } }),
        ]);
        if (cases || licenseTypes) {
          const uses = [cases && `${cases} open case${cases === 1 ? "" : "s"}`, licenseTypes && `${licenseTypes} license type${licenseTypes === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
          const verb = cases + licenseTypes === 1 ? "uses" : "use";
          throw new UserFacingError(`${pipelineLabels(before)[key]} can't be hidden while ${uses} ${verb} it`);
        }
      }
      const custom = label && label !== defaults[key] ? label : undefined;
      if (custom || hidden) next[key] = { ...(custom && { label: custom }), ...(hidden && { hidden: true }) };
    }

    await updatePipelineSettings(org.id, Object.keys(next).length ? next : null);
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "update", actorId: session.user.id, field: "pipelineSettings", oldValue: before, newValue: next });
    revalidatePath("/", "layout");
  });
}
