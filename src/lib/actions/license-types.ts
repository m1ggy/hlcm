"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { PIPELINES, type PipelineKey } from "@/lib/pipeline-labels";
import { toActionResult } from "@/lib/action-result";

const pipelineSchema = z.enum(PIPELINES as [PipelineKey, ...PipelineKey[]], { message: "Pick a pipeline" });

const licenseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  pipeline: pipelineSchema,
});

// Every internal role needs to read these to create/filter Applications;
// only Admins can define them — they're structural config, not case data.
// Retired types (active: false) aren't offered for new cases; `alsoId` keeps
// one in the list anyway (the type a case already has), and Admin > License
// Types asks for all of them.
export async function listLicenseTypes(options: { includeRetired?: boolean; alsoId?: string | null } = {}) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const where = options.includeRetired ? {} : { OR: [{ active: true }, ...(options.alsoId ? [{ id: options.alsoId }] : [])] };
  return db.licenseTypeTemplate.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] });
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

const editSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(1000),
});

/** Rename a license type or change its description. Every case with it shows the new name. */
export async function updateLicenseType(id: string, input: { name: string; description: string }) {
  return toActionResult(async () => {
    const session = await requireRole(["ADMIN"]);
    const next = editSchema.parse(input);
    const before = await db.licenseTypeTemplate.findUniqueOrThrow({ where: { id } });
    const description = next.description || null;
    await db.licenseTypeTemplate.update({ where: { id }, data: { name: next.name, description } });
    for (const [field, oldValue, newValue] of [
      ["name", before.name, next.name],
      ["description", before.description, description],
    ] as const) {
      if (oldValue === newValue) continue;
      await recordAudit({ entityType: "LicenseTypeTemplate", entityId: id, action: "update", actorId: session.user.id, field, oldValue, newValue });
    }
    revalidatePath("/admin/license-types");
    revalidatePath("/applications");
  });
}

/**
 * Retire (active false) or bring back a license type. A retired type isn't
 * offered for new cases or templates; cases that have it keep it.
 */
export async function setLicenseTypeActive(id: string, active: boolean) {
  return toActionResult(async () => {
    const session = await requireRole(["ADMIN"]);
    const before = await db.licenseTypeTemplate.findUniqueOrThrow({ where: { id } });
    if (before.active === active) return;
    await db.licenseTypeTemplate.update({ where: { id }, data: { active } });
    await recordAudit({
      entityType: "LicenseTypeTemplate",
      entityId: id,
      action: active ? "restore" : "archive",
      actorId: session.user.id,
    });
    revalidatePath("/admin/license-types");
    revalidatePath("/applications");
  });
}
