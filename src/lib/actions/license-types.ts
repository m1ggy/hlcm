"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const licenseTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

// Every internal role needs to read these to create/filter Applications;
// only Admins can define them — they're structural config, not case data.
export async function listLicenseTypes() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.licenseTypeTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function createLicenseType(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const parsed = licenseTypeSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  const licenseType = await prisma.licenseTypeTemplate.create({
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
