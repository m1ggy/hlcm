"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, ForbiddenError } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { geocodeAddress } from "@/lib/geocoding";

// A CareRecipient is the person a Caregiver actually visits and gives
// hands-on care to — a different thing from Client (the licensed
// business/facility), see prisma/schema.prisma. Optionally tied to the
// agency Client they're served under; every action here follows the exact
// shape src/lib/actions/clients.ts already uses for the same reason: no
// point inventing new conventions for a record this close in spirit.

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const INCLUDE = {
  client: { select: { id: true as const, name: true as const } },
  assignments: { include: { caregiver: { select: { id: true as const, name: true as const } } } },
  instructions: { orderBy: { sortOrder: "asc" as const } },
};

const careRecipientFields = {
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  contactInfo: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  careNotes: z.string().optional(),
  visitSchedule: z.string().optional(),
  clientId: z.string().optional(),
};

const createSchema = z.object(careRecipientFields);
const updateSchema = z.object(careRecipientFields);

function readFields(formData: FormData) {
  return {
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    contactInfo: formData.get("contactInfo") || undefined,
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    emergencyContactName: formData.get("emergencyContactName") || undefined,
    emergencyContactRelationship: formData.get("emergencyContactRelationship") || undefined,
    emergencyContactPhone: formData.get("emergencyContactPhone") || undefined,
    careNotes: formData.get("careNotes") || undefined,
    visitSchedule: formData.get("visitSchedule") || undefined,
    clientId: formData.get("clientId") || undefined,
  };
}

// Best-effort — geocoding a bad/partial address, or GOOGLE_MAPS_API_KEY
// being unset, must never block saving the recipient itself. Only called
// when the address is present and (on update) actually changed, so editing
// an unrelated field doesn't re-geocode for no reason.
async function geocodeFields(address: string | undefined) {
  if (!address) return { latitude: null, longitude: null, geocodedAt: null };
  const coords = await geocodeAddress(address);
  return coords
    ? { latitude: coords.latitude, longitude: coords.longitude, geocodedAt: new Date() }
    : { latitude: null, longitude: null, geocodedAt: null };
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

// Same filter convention as listClients (src/lib/actions/clients.ts):
// "active" (default) for day-to-day use, "archived" to review/restore ones
// taken off a caregiver's list, "all" where an already-set value needs to
// keep showing regardless of its current state.
export async function listCareRecipients(opts: { clientId?: string; filter?: "active" | "archived" | "all" } = {}) {
  await requireRole([...MANAGE_ROLES]);
  const filter = opts.filter ?? "active";
  return prisma.careRecipient.findMany({
    where: {
      ...(filter === "all" ? {} : { active: filter === "active" }),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
    include: INCLUDE,
    orderBy: { name: "asc" },
  });
}

export async function getCareRecipient(id: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.careRecipient.findUniqueOrThrow({ where: { id }, include: INCLUDE });
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
  const { dateOfBirth, address, ...rest } = parsed;

  const geo = await geocodeFields(address);

  const recipient = await prisma.careRecipient
    .create({
      data: {
        ...rest,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        ...geo,
        createdById: session.user.id,
      },
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
  const { dateOfBirth, address, ...rest } = parsed;

  const before = await prisma.careRecipient.findUniqueOrThrow({ where: { id } });
  // Only re-geocode when the address text actually changed — editing the
  // emergency contact shouldn't re-hit the API for an address that's
  // already correctly pinned.
  const geo = address !== before.address ? await geocodeFields(address) : {};

  const recipient = await prisma.careRecipient
    .update({
      where: { id },
      data: {
        ...rest,
        address,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        ...geo,
      },
    })
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

export async function restoreCareRecipient(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  const recipient = await prisma.careRecipient.update({ where: { id }, data: { active: true } });

  await recordAudit({ ...auditTargetFor(recipient), action: "restore", actorId: session.user.id });

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
    include: {
      client: { select: { id: true, name: true } },
      instructions: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { name: "asc" },
  });
}

// --- Care instructions: concrete, checkable requests for a visit ---------

export async function createCareInstruction(careRecipientId: string, label: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  if (!label.trim()) throw new Error("Instruction can't be empty");

  const [recipient, count] = await Promise.all([
    prisma.careRecipient.findUniqueOrThrow({ where: { id: careRecipientId } }),
    prisma.careInstruction.count({ where: { careRecipientId } }),
  ]);

  await prisma.careInstruction.create({
    data: { careRecipientId, label: label.trim(), sortOrder: count, createdById: session.user.id },
  });

  await recordAudit({
    ...auditTargetFor(recipient),
    action: "add_care_instruction",
    actorId: session.user.id,
    newValue: label.trim(),
  });

  revalidatePath("/clients");
  revalidatePath("/care-recipients");
  if (recipient.clientId) revalidatePath(`/clients/${recipient.clientId}`);
}

// Reachable by staff managing the record, and by the Caregiver actually on
// the visit checking items off — but a Caregiver only for a recipient
// they're assigned to, never any instruction by id.
export async function toggleCareInstruction(id: string, completed: boolean) {
  const session = await requireSession();
  const role = session.user.role as (typeof MANAGE_ROLES)[number] | "CAREGIVER" | string;

  const instruction = await prisma.careInstruction.findUniqueOrThrow({ where: { id } });

  if (!MANAGE_ROLES.includes(role as (typeof MANAGE_ROLES)[number])) {
    if (role !== "CAREGIVER") throw new ForbiddenError();
    const assigned = await prisma.careRecipientAssignment.findUnique({
      where: { careRecipientId_caregiverId: { careRecipientId: instruction.careRecipientId, caregiverId: session.user.id } },
    });
    if (!assigned) throw new ForbiddenError();
  }

  await prisma.careInstruction.update({ where: { id }, data: { completed } });

  revalidatePath("/clients");
  revalidatePath("/care-recipients");
}

export async function deleteCareInstruction(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const instruction = await prisma.careInstruction.findUniqueOrThrow({
    where: { id },
    include: { careRecipient: true },
  });

  await prisma.careInstruction.delete({ where: { id } });

  await recordAudit({
    ...auditTargetFor(instruction.careRecipient),
    action: "remove_care_instruction",
    actorId: session.user.id,
    oldValue: instruction.label,
  });

  revalidatePath("/clients");
  revalidatePath("/care-recipients");
}
