"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// A CareRecipient is the person a Caregiver actually visits and gives
// hands-on care to — a different thing from Client (the licensed
// business/facility), see prisma/schema.prisma. Optionally tied to the
// agency Client they're served under; every action here follows the exact
// shape src/lib/actions/clients.ts already uses for the same reason: no
// point inventing new conventions for a record this close in spirit.

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const careRecipientFields = {
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  contactInfo: z.string().optional(),
  notes: z.string().optional(),
  clientId: z.string().optional(),
};

const createSchema = z.object(careRecipientFields);
const updateSchema = z.object(careRecipientFields);

function readFields(formData: FormData) {
  return {
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    contactInfo: formData.get("contactInfo") || undefined,
    notes: formData.get("notes") || undefined,
    clientId: formData.get("clientId") || undefined,
  };
}

// Logged under the owning Client's own audit trail when there is one — same
// convention Phase 8 of the pipeline-stage rollout settled on for MCO
// credentials and login credentials (see docs/pipeline-stage-plan.md): a
// sub-record close enough to a Client that staff expect to find its history
// on that Client's own Audit Log tab, not a separate one of its own. A
// recipient with no agency on file falls back to logging against itself.
function auditTargetFor(recipient: { id: string; clientId: string | null }) {
  return recipient.clientId
    ? { entityType: "Client" as const, entityId: recipient.clientId }
    : { entityType: "CareRecipient" as const, entityId: recipient.id };
}

export async function listCareRecipients(opts: { clientId?: string } = {}) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.careRecipient.findMany({
    where: { active: true, ...(opts.clientId ? { clientId: opts.clientId } : {}) },
    include: {
      client: { select: { id: true, name: true } },
      assignments: { include: { caregiver: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCareRecipient(id: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.careRecipient.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      assignments: { include: { caregiver: { select: { id: true, name: true } } } },
    },
  });
}

// Every active Caregiver — for the "Assign caregiver" picker. Not gated to
// a specific recipient's own assignees, this is the full pool to choose
// from.
export async function listCaregivers() {
  await requireRole([...MANAGE_ROLES]);
  return prisma.user.findMany({
    where: { role: "CAREGIVER", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function createCareRecipient(formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = createSchema.parse(readFields(formData));

  const recipient = await prisma.careRecipient
    .create({
      data: { ...parsed, createdById: session.user.id },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordAudit({
    ...auditTargetFor(recipient),
    action: "add_care_recipient",
    actorId: session.user.id,
    newValue: recipient.name,
  });

  revalidatePath("/clients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
  return recipient;
}

export async function updateCareRecipient(id: string, formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = updateSchema.parse(readFields(formData));

  const before = await prisma.careRecipient.findUniqueOrThrow({ where: { id } });
  const recipient = await prisma.careRecipient
    .update({ where: { id }, data: parsed })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordFieldChanges({
    ...auditTargetFor(recipient),
    action: "update_care_recipient",
    actorId: session.user.id,
    before,
    after: recipient,
  });

  revalidatePath("/clients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
  if (before.clientId && before.clientId !== recipient.clientId) revalidatePath(`/clients/${before.clientId}`);
  return recipient;
}

export async function archiveCareRecipient(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const recipient = await prisma.careRecipient.update({ where: { id }, data: { active: false } });

  await recordAudit({ ...auditTargetFor(recipient), action: "archive", actorId: session.user.id });

  revalidatePath("/clients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
}

export async function assignCaregiver(careRecipientId: string, caregiverId: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const [recipient, caregiver] = await Promise.all([
    prisma.careRecipient.findUniqueOrThrow({ where: { id: careRecipientId } }),
    prisma.user.findUniqueOrThrow({ where: { id: caregiverId } }),
  ]);
  if (caregiver.role !== "CAREGIVER") throw new Error("That user isn't a Caregiver");

  await prisma.careRecipientAssignment
    .create({
      data: { careRecipientId, caregiverId, assignedById: session.user.id },
    })
    .catch((e) =>
      friendlyPrismaError(e, {
        duplicateMessages: { "careRecipientId,caregiverId": "That caregiver is already assigned" },
      })
    );

  await recordAudit({
    ...auditTargetFor(recipient),
    action: "assign_caregiver",
    actorId: session.user.id,
    newValue: caregiver.name,
  });

  revalidatePath("/clients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
}

export async function unassignCaregiver(careRecipientId: string, caregiverId: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const [recipient, caregiver] = await Promise.all([
    prisma.careRecipient.findUniqueOrThrow({ where: { id: careRecipientId } }),
    prisma.user.findUnique({ where: { id: caregiverId }, select: { name: true } }),
  ]);

  await prisma.careRecipientAssignment.deleteMany({ where: { careRecipientId, caregiverId } });

  await recordAudit({
    ...auditTargetFor(recipient),
    action: "unassign_caregiver",
    actorId: session.user.id,
    oldValue: caregiver?.name,
  });

  revalidatePath("/clients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
}

// Both derive the caller's id from the session, never from a caller-supplied
// parameter — same reasoning as listCaregiverClients/getCaregiverClient in
// clients.ts: trusting a passed-in userId would let anyone enumerate
// another Caregiver's recipients.
export async function listMyCareRecipients() {
  const session = await requireRole(["CAREGIVER"]);
  return prisma.careRecipient.findMany({
    where: { active: true, assignments: { some: { caregiverId: session.user.id } } },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
}
