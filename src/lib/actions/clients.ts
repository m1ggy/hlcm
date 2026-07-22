"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";

const clientSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  name: z.string().min(1, "Name is required"),
  contactInfo: z.string().optional(),
  address: z.string().optional(),
});

// Client records aren't owned/scoped — every internal role needs to find a
// client to open a new Application against them. Only the external CLIENT
// portal role (Phase 5) is excluded.
export async function listClients() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.client.findMany({ orderBy: { name: "asc" }, include: { project: true } });
}

export async function getClient(id: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.client.findUnique({ where: { id } });
}

export async function createClient(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = clientSchema.parse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    contactInfo: formData.get("contactInfo") || undefined,
    address: formData.get("address") || undefined,
  });

  const client = await prisma.client.create({
    data: { ...parsed, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "Client",
    entityId: client.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/clients");
  revalidatePath(`/projects/${parsed.projectId}`);
  return client;
}

export async function updateClient(id: string, formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = clientSchema.parse({
    name: formData.get("name"),
    contactInfo: formData.get("contactInfo") || undefined,
    address: formData.get("address") || undefined,
  });

  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  const client = await prisma.client.update({ where: { id }, data: parsed });

  await recordFieldChanges({
    entityType: "Client",
    entityId: id,
    actorId: session.user.id,
    action: "update",
    before,
    after: client,
  });

  revalidatePath("/clients");
  return client;
}
