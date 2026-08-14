"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";

const clientDetailFields = {
  name: z.string().min(1, "Name is required"),
  contactInfo: z.string().optional(),
  address: z.string().optional(),
  businessName: z.string().optional(),
  businessPhone: z.string().optional(),
  businessEmail: z.string().optional(),
  ownerName: z.string().optional(),
  ownerEmail: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerDateOfBirth: z.string().optional(),
};

const createClientSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  ...clientDetailFields,
});

const updateClientSchema = z.object(clientDetailFields);

function readClientFields(formData: FormData) {
  return {
    name: formData.get("name"),
    contactInfo: formData.get("contactInfo") || undefined,
    address: formData.get("address") || undefined,
    businessName: formData.get("businessName") || undefined,
    businessPhone: formData.get("businessPhone") || undefined,
    businessEmail: formData.get("businessEmail") || undefined,
    ownerName: formData.get("ownerName") || undefined,
    ownerEmail: formData.get("ownerEmail") || undefined,
    ownerPhone: formData.get("ownerPhone") || undefined,
    ownerDateOfBirth: formData.get("ownerDateOfBirth") || undefined,
  };
}

// Client records aren't owned/scoped — every internal role needs to find a
// client to open a new Application against them. Only the external CLIENT
// portal role (Phase 5) is excluded.
// `filter: "all"` includes archived clients too — used where an already-set
// value (e.g. an Application's client dropdown) needs to keep showing even
// after that client was archived, not just when picking a new one.
export async function listClients(opts: { filter?: "active" | "archived" | "all" } = {}) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const filter = opts.filter ?? "active";
  return prisma.client.findMany({
    where: filter === "all" ? {} : { active: filter === "active" },
    orderBy: { name: "asc" },
    include: { projects: { include: { serviceType: true } } },
  });
}

export async function getClient(id: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      projects: { orderBy: { name: "asc" }, include: { serviceType: true } },
      applications: {
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getClientAuditLog(clientId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.auditLog.findMany({
    where: { entityType: "Client", entityId: clientId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createClient(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = createClientSchema.parse({
    projectId: formData.get("projectId"),
    ...readClientFields(formData),
  });
  const { ownerDateOfBirth, projectId, ...rest } = parsed;

  const client = await prisma.client.create({
    data: {
      ...rest,
      ownerDateOfBirth: ownerDateOfBirth ? new Date(ownerDateOfBirth) : undefined,
      createdById: session.user.id,
      projects: { connect: { id: projectId } },
    },
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
  const parsed = updateClientSchema.parse(readClientFields(formData));
  const { ownerDateOfBirth, ...rest } = parsed;

  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  const client = await prisma.client.update({
    where: { id },
    data: {
      ...rest,
      ownerDateOfBirth: ownerDateOfBirth ? new Date(ownerDateOfBirth) : null,
    },
  });

  await recordFieldChanges({
    entityType: "Client",
    entityId: id,
    actorId: session.user.id,
    action: "update",
    before,
    after: client,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return client;
}

export async function archiveClient(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.client.update({ where: { id }, data: { active: false } });

  await recordAudit({ entityType: "Client", entityId: id, action: "archive", actorId: session.user.id });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

export async function restoreClient(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.client.update({ where: { id }, data: { active: true } });

  await recordAudit({ entityType: "Client", entityId: id, action: "restore", actorId: session.user.id });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
}

// Links an existing client into another project instead of re-entering the
// same business's details — the whole point of the many-to-many relation.
export async function importClientToProject(clientId: string, projectId: string) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  await prisma.client.update({
    where: { id: clientId },
    data: { projects: { connect: { id: projectId } } },
  });

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "link_project",
    actorId: session.user.id,
    newValue: project.name,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/projects/${projectId}`);
}

// Undoes an import (or a client added to the wrong project). A client
// always needs at least one project, so removing its last one is refused —
// archive the client instead if it shouldn't be active anywhere anymore.
export async function removeClientFromProject(clientId: string, projectId: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { projects: { select: { id: true, name: true } } },
  });
  if (client.projects.length <= 1) {
    throw new Error("A client needs at least one project — archive it instead if it's no longer active anywhere.");
  }
  const project = client.projects.find((p) => p.id === projectId);

  await prisma.client.update({
    where: { id: clientId },
    data: { projects: { disconnect: { id: projectId } } },
  });

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "unlink_project",
    actorId: session.user.id,
    oldValue: project?.name,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/projects/${projectId}`);
}
