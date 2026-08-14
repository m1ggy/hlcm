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
export async function listProjects(opts: { archived?: boolean } = {}) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.project.findMany({
    where: { active: !opts.archived },
    orderBy: { name: "asc" },
    include: { _count: { select: { clients: true } } },
  });
}

export async function getProject(id: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.project.findUniqueOrThrow({
    where: { id },
    include: {
      clients: { where: { active: true }, orderBy: { name: "asc" } },
      serviceType: true,
    },
  });
}

export async function archiveProject(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.project.update({ where: { id }, data: { active: false } });

  await recordAudit({ entityType: "Project", entityId: id, action: "archive", actorId: session.user.id });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function restoreProject(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.project.update({ where: { id }, data: { active: true } });

  await recordAudit({ entityType: "Project", entityId: id, action: "restore", actorId: session.user.id });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function listServiceTypes() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.serviceType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

// Empty string clears the color back to the neutral default — distinct from
// not sending the field at all, same convention as the case-fields update.
export async function updateProjectServiceType(id: string, serviceTypeId: string) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const before = await prisma.project.findUniqueOrThrow({ where: { id } });
  const project = await prisma.project.update({
    where: { id },
    data: { serviceTypeId: serviceTypeId === "" ? null : serviceTypeId },
  });

  await recordAudit({
    entityType: "Project",
    entityId: id,
    action: "update",
    field: "serviceTypeId",
    oldValue: before.serviceTypeId,
    newValue: project.serviceTypeId,
    actorId: session.user.id,
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/clients");
  return project;
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
