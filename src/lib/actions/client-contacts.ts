"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// Additional, individually-labeled contacts on a Client — a partner, an
// office manager, whoever else is involved in communication beyond the
// single freeform "Other contact info" line. Logged under the owning
// Client's own audit trail, same convention as CareRecipient/MCO
// credentials/login credentials (see docs/pipeline-stage-plan.md Phase 8).

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const contactFields = {
  name: z.string().min(1, "Name is required"),
  role: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
};

const createSchema = z.object({ clientId: z.string().min(1), ...contactFields });
const updateSchema = z.object(contactFields);

function readFields(formData: FormData) {
  return {
    name: formData.get("name"),
    role: formData.get("role") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  };
}

export async function listClientContacts(clientId: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientContact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
}

export async function createClientContact(formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = createSchema.parse({ clientId: formData.get("clientId"), ...readFields(formData) });
  const { clientId, ...rest } = parsed;

  const contact = await prisma.clientContact
    .create({ data: { ...rest, clientId, createdById: session.user.id } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_client_contact",
    actorId: session.user.id,
    newValue: contact.name,
  });

  revalidatePath(`/clients/${clientId}`);
  return contact;
}

export async function updateClientContact(id: string, formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = updateSchema.parse(readFields(formData));

  const before = await prisma.clientContact.findUniqueOrThrow({ where: { id } });
  const contact = await prisma.clientContact.update({ where: { id }, data: parsed });

  await recordAudit({
    entityType: "Client",
    entityId: contact.clientId,
    action: "update_client_contact",
    actorId: session.user.id,
    oldValue: before.name,
    newValue: contact.name,
  });

  revalidatePath(`/clients/${contact.clientId}`);
  return contact;
}

export async function deleteClientContact(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const contact = await prisma.clientContact.delete({ where: { id } });

  await recordAudit({
    entityType: "Client",
    entityId: contact.clientId,
    action: "remove_client_contact",
    actorId: session.user.id,
    oldValue: contact.name,
  });

  revalidatePath(`/clients/${contact.clientId}`);
}
