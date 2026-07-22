"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const caseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export async function listCaseTypes() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.caseType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function createCaseType(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const parsed = caseTypeSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  const caseType = await prisma.caseType.create({
    data: { ...parsed, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "CaseType",
    entityId: caseType.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/admin/case-types");
  return caseType;
}
