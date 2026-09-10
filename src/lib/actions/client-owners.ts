"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// Replaces the old single ownerName/ownerEmail/ownerPhone/ownerDateOfBirth
// fields on Client — some companies have two or three owners/partners, so
// this is a repeatable list instead. Same CRUD shape as client-contacts.ts,
// logged under the owning Client's own audit trail.

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const ownerFields = {
  name: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  ownershipPercentage: z.string().optional(),
};

const createSchema = z.object({ clientId: z.string().min(1), ...ownerFields });
const updateSchema = z.object(ownerFields);

function readFields(formData: FormData) {
  return {
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    ownershipPercentage: formData.get("ownershipPercentage") || undefined,
  };
}

function toPercentage(value: string | undefined) {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function listClientOwners(clientId: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientOwner.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
}

export async function createClientOwner(formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = createSchema.parse({ clientId: formData.get("clientId"), ...readFields(formData) });
  const { clientId, ownershipPercentage, ...rest } = parsed;

  const owner = await prisma.clientOwner
    .create({
      data: { ...rest, ownershipPercentage: toPercentage(ownershipPercentage), clientId, createdById: session.user.id },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_client_owner",
    actorId: session.user.id,
    newValue: owner.name,
  });

  revalidatePath(`/clients/${clientId}`);
  return owner;
}

export async function updateClientOwner(id: string, formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = updateSchema.parse(readFields(formData));
  const { ownershipPercentage, ...rest } = parsed;

  const before = await prisma.clientOwner.findUniqueOrThrow({ where: { id } });
  const owner = await prisma.clientOwner.update({
    where: { id },
    data: { ...rest, ownershipPercentage: toPercentage(ownershipPercentage) ?? null },
  });

  await recordAudit({
    entityType: "Client",
    entityId: owner.clientId,
    action: "update_client_owner",
    actorId: session.user.id,
    oldValue: before.name,
    newValue: owner.name,
  });

  revalidatePath(`/clients/${owner.clientId}`);
  return owner;
}

export async function deleteClientOwner(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const owner = await prisma.clientOwner.delete({ where: { id } });

  await recordAudit({
    entityType: "Client",
    entityId: owner.clientId,
    action: "remove_client_owner",
    actorId: session.user.id,
    oldValue: owner.name,
  });

  revalidatePath(`/clients/${owner.clientId}`);
}
