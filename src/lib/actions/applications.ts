"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireRole,
  requireSession,
  applicationVisibilityFilter,
  assertApplicationAccess,
} from "@/lib/rbac";
import { recordFieldChanges, recordAudit } from "@/lib/audit";
import { cloneChecklistForApplication } from "@/lib/checklist-clone";
import { notify } from "@/lib/notifications";

const APPLICATION_STATUSES = [
  "DRAFT",
  "INFO_GATHERING",
  "SUBMITTED",
  "UNDER_AGENCY_REVIEW",
  "NEEDS_REVISION",
  "APPROVED",
  "DENIED",
  "CLOSED",
] as const;

const applicationSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  assignedUserId: z.string().min(1),
  status: z.enum(APPLICATION_STATUSES).optional(),
  licenseTypeTemplateId: z.string().optional(),
  caseTypeId: z.string().optional(),
});

export async function listApplications() {
  const session = await requireSession();
  return prisma.application.findMany({
    where: applicationVisibilityFilter(session),
    include: { client: true, assignedUser: true },
    orderBy: { createdAt: "desc" },
  });
}

async function assertCanEditApplication(
  session: Awaited<ReturnType<typeof requireSession>>,
  applicationId: string
) {
  await assertApplicationAccess(session, applicationId, "edit");
}

export async function getApplication(id: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, id, "view");
  return prisma.application.findUniqueOrThrow({
    where: { id },
    include: { client: true, assignedUser: true, licenseTypeTemplate: true, caseType: true },
  });
}

export async function getApplicationAuditLog(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  return prisma.auditLog.findMany({
    where: { entityType: "Application", entityId: applicationId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAssignableUsers() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "MANAGER", "STAFF"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}

export async function createApplication(formData: FormData) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const parsed = applicationSchema.parse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    assignedUserId: formData.get("assignedUserId") || session.user.id,
    licenseTypeTemplateId: formData.get("licenseTypeTemplateId") || undefined,
    caseTypeId: formData.get("caseTypeId") || undefined,
  });

  const application = await prisma.application.create({
    data: {
      clientId: parsed.clientId,
      name: parsed.name,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      licenseTypeTemplateId: parsed.licenseTypeTemplateId,
      caseTypeId: parsed.caseTypeId,
      createdById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Application",
    entityId: application.id,
    action: "create",
    actorId: session.user.id,
  });

  await cloneChecklistForApplication({
    applicationId: application.id,
    licenseTypeTemplateId: parsed.licenseTypeTemplateId ?? null,
    caseTypeId: parsed.caseTypeId ?? null,
    assignedUserId: parsed.assignedUserId,
    actorId: session.user.id,
  });

  revalidatePath("/applications");
  return application;
}

export async function updateApplication(id: string, formData: FormData) {
  const session = await requireSession();
  await assertCanEditApplication(session, id);

  const parsed = applicationSchema.parse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    assignedUserId: formData.get("assignedUserId"),
    status: formData.get("status") || undefined,
  });

  const before = await prisma.application.findUniqueOrThrow({ where: { id } });
  const application = await prisma.application.update({
    where: { id },
    data: {
      clientId: parsed.clientId,
      name: parsed.name,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      status: parsed.status,
    },
  });

  await recordFieldChanges({
    entityType: "Application",
    entityId: id,
    actorId: session.user.id,
    action: "update",
    before,
    after: application,
  });

  if (before.status !== application.status) {
    await notify(
      {
        userId: application.assignedUserId,
        type: "APPLICATION_STATUS_CHANGED",
        message: `"${application.name}" status changed to ${application.status}`,
        entityType: "Application",
        entityId: id,
      },
      session.user.id
    );
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  return application;
}

// Lean status-only update for drag-drop board views — avoids re-sending the
// whole form just to move a card between columns.
export async function updateApplicationStatus(id: string, status: (typeof APPLICATION_STATUSES)[number]) {
  const session = await requireSession();
  await assertCanEditApplication(session, id);
  const parsedStatus = z.enum(APPLICATION_STATUSES).parse(status);

  const before = await prisma.application.findUniqueOrThrow({ where: { id } });
  const application = await prisma.application.update({ where: { id }, data: { status: parsedStatus } });

  await recordFieldChanges({
    entityType: "Application",
    entityId: id,
    actorId: session.user.id,
    action: "update",
    before,
    after: application,
  });

  if (before.status !== application.status) {
    await notify(
      {
        userId: application.assignedUserId,
        type: "APPLICATION_STATUS_CHANGED",
        message: `"${application.name}" status changed to ${application.status}`,
        entityType: "Application",
        entityId: id,
      },
      session.user.id
    );
  }

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  return application;
}

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  assignedUserId: z.string().optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
});

// Bulk reassign and/or status-change for the Applications table's multi-select.
export async function bulkUpdateApplications(input: z.infer<typeof bulkUpdateSchema>) {
  const session = await requireSession();
  const parsed = bulkUpdateSchema.parse(input);

  for (const id of parsed.ids) {
    await assertCanEditApplication(session, id);
  }

  for (const id of parsed.ids) {
    const before = await prisma.application.findUniqueOrThrow({ where: { id } });
    const application = await prisma.application.update({
      where: { id },
      data: {
        assignedUserId: parsed.assignedUserId,
        status: parsed.status,
      },
    });

    await recordFieldChanges({
      entityType: "Application",
      entityId: id,
      actorId: session.user.id,
      action: "update",
      before,
      after: application,
    });

    if (parsed.status && before.status !== application.status) {
      await notify(
        {
          userId: application.assignedUserId,
          type: "APPLICATION_STATUS_CHANGED",
          message: `"${application.name}" status changed to ${application.status}`,
          entityType: "Application",
          entityId: id,
        },
        session.user.id
      );
    }
  }

  revalidatePath("/applications");
  return { count: parsed.ids.length };
}
