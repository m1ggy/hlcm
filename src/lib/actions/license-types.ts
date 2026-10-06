"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { PIPELINES, type PipelineKey } from "@/lib/pipeline-labels";

const pipelineSchema = z.enum(PIPELINES as [PipelineKey, ...PipelineKey[]], { message: "Pick a pipeline" });

const licenseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  pipeline: pipelineSchema,
});

// Every internal role needs to read these to create/filter Applications;
// only Admins can define them — they're structural config, not case data.
export async function listLicenseTypes() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return db.licenseTypeTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function createLicenseType(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const parsed = licenseTypeSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    pipeline: formData.get("pipeline"),
  });

  const licenseType = await db.licenseTypeTemplate.create({
    data: { ...parsed, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "LicenseTypeTemplate",
    entityId: licenseType.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/admin/license-types");
  return licenseType;
}

/**
 * Which pipeline new cases with this license type go into. Cases already
 * open keep their pipeline and stage — only cases created (or re-typed)
 * afterwards use the new one.
 */
export async function updateLicenseTypePipeline(id: string, pipeline: string) {
  const session = await requireRole(["ADMIN"]);
  const next = pipelineSchema.parse(pipeline);
  const before = await db.licenseTypeTemplate.findUniqueOrThrow({ where: { id } });
  if (before.pipeline === next) return;
  await db.licenseTypeTemplate.update({ where: { id }, data: { pipeline: next } });
  await recordAudit({
    entityType: "LicenseTypeTemplate",
    entityId: id,
    action: "update",
    actorId: session.user.id,
    field: "pipeline",
    oldValue: before.pipeline,
    newValue: next,
  });
  revalidatePath("/admin/license-types");
}
