"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const ROLE_VALUES = ["ADMIN", "MANAGER", "STAFF", "CLIENT"] as const;

const checklistItemTemplateSchema = z.object({
  licenseTypeTemplateId: z.string().optional(),
  caseTypeId: z.string().min(1, "Case type is required"),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  phaseName: z.string().optional(),
  defaultRole: z.enum(ROLE_VALUES).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function listChecklistItemTemplates() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.checklistItemTemplate.findMany({
    include: { licenseTypeTemplate: true, caseType: true },
    orderBy: [{ caseTypeId: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createChecklistItemTemplate(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const parsed = checklistItemTemplateSchema.parse({
    licenseTypeTemplateId: formData.get("licenseTypeTemplateId") || undefined,
    caseTypeId: formData.get("caseTypeId"),
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    phaseName: formData.get("phaseName") || undefined,
    defaultRole: formData.get("defaultRole") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

  const item = await prisma.checklistItemTemplate.create({
    data: { ...parsed, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "ChecklistItemTemplate",
    entityId: item.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/admin/checklist-templates");
  return item;
}

export async function deleteChecklistItemTemplate(id: string) {
  const session = await requireRole(["ADMIN"]);
  await prisma.checklistItemTemplate.delete({ where: { id } });

  await recordAudit({
    entityType: "ChecklistItemTemplate",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
  });

  revalidatePath("/admin/checklist-templates");
}
