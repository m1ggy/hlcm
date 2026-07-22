"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

// Same visibility as Clients — every internal role can see all Projects to
// find where to file a new client. Access Grant-style per-project scoping
// isn't needed yet; revisit if that changes.
export async function listProjects() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.project.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { clients: true } } },
  });
}

export async function getProject(id: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.project.findUniqueOrThrow({
    where: { id },
    include: { clients: { orderBy: { name: "asc" } } },
  });
}

export async function createProject(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = projectSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  const project = await prisma.project.create({
    data: { ...parsed, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "Project",
    entityId: project.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/projects");
  return project;
}
