"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const credentialSchema = z.object({
  label: z.string().min(1, "Label is required"),
  username: z.string().optional(),
  password: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
});

// Same visibility/write access as the rest of a Client record — every
// internal role can add one, matching "when the manager or VA adds notes"
// from the spec (a VA needs to actually use these to log into a portal).
export async function listClientCredentials(clientId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.clientCredential.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createClientCredential(clientId: string, formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = credentialSchema.parse({
    label: formData.get("label"),
    username: formData.get("username") || undefined,
    password: formData.get("password") || undefined,
    url: formData.get("url") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const credential = await prisma.clientCredential.create({
    data: { ...parsed, clientId, createdById: session.user.id },
  });

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_credential",
    actorId: session.user.id,
    newValue: parsed.label,
  });

  revalidatePath(`/clients/${clientId}`);
  return credential;
}

export async function updateClientCredential(id: string, formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = credentialSchema.parse({
    label: formData.get("label"),
    username: formData.get("username") || undefined,
    password: formData.get("password") || undefined,
    url: formData.get("url") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const credential = await prisma.clientCredential.update({
    where: { id },
    data: parsed,
  });

  await recordAudit({
    entityType: "Client",
    entityId: credential.clientId,
    action: "update_credential",
    actorId: session.user.id,
    newValue: parsed.label,
  });

  revalidatePath(`/clients/${credential.clientId}`);
  return credential;
}

export async function deleteClientCredential(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const credential = await prisma.clientCredential.findUniqueOrThrow({ where: { id } });
  await prisma.clientCredential.delete({ where: { id } });

  await recordAudit({
    entityType: "Client",
    entityId: credential.clientId,
    action: "remove_credential",
    actorId: session.user.id,
    oldValue: credential.label,
  });

  revalidatePath(`/clients/${credential.clientId}`);
}
