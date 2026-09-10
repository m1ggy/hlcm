"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// License & credential tracker per client — named ClientLicense (not
// ClientCredential, which already exists and means portal login
// credentials — unrelated). Same CRUD shape as the other Client
// sub-records this session, logged under the owning Client's own audit
// trail. Feeds both the dashboard's License Alerts card and the daily
// digest email (see aging-alerts.ts computeLicenseAlerts,
// src/lib/actions/alerts.ts listLicenseAlerts, src/lib/due-date-digest.ts).

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const licenseFields = {
  licenseType: z.string().min(1, "License type is required"),
  licenseNumber: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().min(1, "Expiry date is required"),
  status: z.string().optional(),
};

const createSchema = z.object({ clientId: z.string().min(1), ...licenseFields });
const updateSchema = z.object(licenseFields);

function readFields(formData: FormData) {
  return {
    licenseType: formData.get("licenseType"),
    licenseNumber: formData.get("licenseNumber") || undefined,
    issuedDate: formData.get("issuedDate") || undefined,
    expiryDate: formData.get("expiryDate"),
    status: formData.get("status") || undefined,
  };
}

// Soonest-expiring first — the tracker's whole point is surfacing what
// needs renewing next.
export async function listClientLicenses(clientId: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientLicense.findMany({ where: { clientId }, orderBy: { expiryDate: "asc" } });
}

export async function createClientLicense(formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = createSchema.parse({ clientId: formData.get("clientId"), ...readFields(formData) });
  const { clientId, issuedDate, expiryDate, ...rest } = parsed;

  const license = await prisma.clientLicense
    .create({
      data: {
        ...rest,
        clientId,
        issuedDate: issuedDate ? new Date(issuedDate) : undefined,
        expiryDate: new Date(expiryDate),
        createdById: session.user.id,
      },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That client no longer exists" }));

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_client_license",
    actorId: session.user.id,
    newValue: license.licenseType,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
  return license;
}

export async function updateClientLicense(id: string, formData: FormData) {
  const session = await requireRole([...MANAGE_ROLES]);
  const parsed = updateSchema.parse(readFields(formData));
  const { issuedDate, expiryDate, ...rest } = parsed;

  const before = await prisma.clientLicense.findUniqueOrThrow({ where: { id } });
  const license = await prisma.clientLicense.update({
    where: { id },
    data: { ...rest, issuedDate: issuedDate ? new Date(issuedDate) : null, expiryDate: new Date(expiryDate) },
  });

  await recordAudit({
    entityType: "Client",
    entityId: license.clientId,
    action: "update_client_license",
    actorId: session.user.id,
    oldValue: before.licenseType,
    newValue: license.licenseType,
  });

  revalidatePath(`/clients/${license.clientId}`);
  revalidatePath("/");
  return license;
}

export async function deleteClientLicense(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const license = await prisma.clientLicense.delete({ where: { id } });

  await recordAudit({
    entityType: "Client",
    entityId: license.clientId,
    action: "remove_client_license",
    actorId: session.user.id,
    oldValue: license.licenseType,
  });

  revalidatePath(`/clients/${license.clientId}`);
  revalidatePath("/");
}
