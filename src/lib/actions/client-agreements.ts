"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// Full agreement history per client — a repeatable list rather than fields
// that get overwritten on renewal, so "what did we agree to last time" is
// never lost. Same CRUD shape as client-contacts.ts/client-owners.ts,
// logged under the owning Client's own audit trail.

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const agreementFields = {
  agreementType: z.string().min(1, "Agreement type is required"),
  signedDate: z.string().optional(),
  amount: z.string().optional(),
  paymentStatus: z.string().optional(),
  notes: z.string().optional(),
};

const createSchema = z.object({ clientId: z.string().min(1), ...agreementFields });
const updateSchema = z.object(agreementFields);

function readFields(formData: FormData) {
  return {
    agreementType: formData.get("agreementType"),
    signedDate: formData.get("signedDate") || undefined,
    amount: formData.get("amount") || undefined,
    paymentStatus: formData.get("paymentStatus") || undefined,
    notes: formData.get("notes") || undefined,
  };
}

function toAmount(value: string | undefined) {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Newest signed first (undated ones last) — the plan's own "at a glance"
// ask, so the card can just take element 0 as the current agreement.
export async function listClientAgreements(clientId: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientAgreement.findMany({
    where: { clientId },
    orderBy: [{ signedDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function createClientAgreement(formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = createSchema.parse({ clientId: formData.get("clientId"), ...readFields(formData) });
  const { clientId, signedDate, amount, ...rest } = parsed;

  const agreement = await prisma.clientAgreement
    .create({
      data: {
        ...rest,
        clientId,
        signedDate: signedDate ? new Date(signedDate) : undefined,
        amount: toAmount(amount),
        createdById: session.user.id,
      },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_client_agreement",
    actorId: session.user.id,
    newValue: agreement.agreementType,
  });

  revalidatePath(`/clients/${clientId}`);
  return agreement;
}

export async function updateClientAgreement(id: string, formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = updateSchema.parse(readFields(formData));
  const { signedDate, amount, ...rest } = parsed;

  const before = await prisma.clientAgreement.findUniqueOrThrow({ where: { id } });
  const agreement = await prisma.clientAgreement.update({
    where: { id },
    data: { ...rest, signedDate: signedDate ? new Date(signedDate) : null, amount: toAmount(amount) ?? null },
  });

  await recordAudit({
    entityType: "Client",
    entityId: agreement.clientId,
    action: "update_client_agreement",
    actorId: session.user.id,
    oldValue: before.agreementType,
    newValue: agreement.agreementType,
  });

  revalidatePath(`/clients/${agreement.clientId}`);
  return agreement;
}

export async function deleteClientAgreement(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const agreement = await prisma.clientAgreement.delete({ where: { id } });

  await recordAudit({
    entityType: "Client",
    entityId: agreement.clientId,
    action: "remove_client_agreement",
    actorId: session.user.id,
    oldValue: agreement.agreementType,
  });

  revalidatePath(`/clients/${agreement.clientId}`);
}
