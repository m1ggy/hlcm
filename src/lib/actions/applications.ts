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
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";
import { STALE_THRESHOLD_DAYS, computeReadyToSubmit, computeStaleDays } from "@/lib/application-flags";
import { pipelineForLicenseType, getInitialStage } from "@/lib/pipeline";

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

export async function listApplications(opts: { archived?: boolean } = {}) {
  const session = await requireSession();
  const applications = await prisma.application.findMany({
    where: { ...applicationVisibilityFilter(session), active: !opts.archived },
    include: { client: true, assignedUser: true, tasks: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
  });

  const staleCandidateIds = applications
    .filter((a) => STALE_THRESHOLD_DAYS[a.status] !== undefined)
    .map((a) => a.id);

  const statusChangeLogs = staleCandidateIds.length
    ? await prisma.auditLog.findMany({
        where: { entityType: "Application", entityId: { in: staleCandidateIds }, field: "status" },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, createdAt: true },
      })
    : [];
  const statusSinceById = new Map<string, Date>();
  for (const log of statusChangeLogs) {
    if (!statusSinceById.has(log.entityId)) statusSinceById.set(log.entityId, log.createdAt);
  }

  return applications.map(({ tasks, ...app }) => {
    const taskProgress = {
      total: tasks.length,
      done: tasks.filter((t) => TASK_CLOSED_STATUSES.includes(t.status as (typeof TASK_CLOSED_STATUSES)[number]))
        .length,
    };
    return {
      ...app,
      taskProgress,
      readyToSubmit: computeReadyToSubmit(app.status, taskProgress),
      staleDays: computeStaleDays(app.status, statusSinceById.get(app.id) ?? app.createdAt),
    };
  });
}

// Status changes notify the owner plus everyone with an AccessGrant on the
// application — that includes CLIENT-role portal users and staff colleagues
// with shared VIEW/EDIT access, neither of whom heard about status changes
// before this. `notify()` already no-ops for the actor notifying themselves.
async function notifyApplicationStakeholders(
  applicationId: string,
  application: { name: string; status: string; assignedUserId: string },
  actorId: string
) {
  const grantees = await prisma.accessGrant.findMany({
    where: { applicationId },
    select: { userId: true },
  });
  const recipients = new Set([application.assignedUserId, ...grantees.map((g) => g.userId)]);
  for (const userId of recipients) {
    await notify(
      {
        userId,
        type: "APPLICATION_STATUS_CHANGED",
        message: `"${application.name}" status changed to ${application.status}`,
        entityType: "Application",
        entityId: applicationId,
      },
      actorId
    );
  }
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

  // Which pipeline (and starting stage within it) this case enters, derived
  // from the license type — see docs/pipeline-stage-plan.md. Stays null when
  // the license type isn't mapped to a pipeline yet (e.g. Change of
  // Ownership has no license type at all); pipeline/stageId are nullable for
  // exactly this reason.
  const licenseType = parsed.licenseTypeTemplateId
    ? await prisma.licenseTypeTemplate.findUnique({ where: { id: parsed.licenseTypeTemplateId } })
    : null;
  const pipeline = pipelineForLicenseType(licenseType?.name);
  const initialStage = pipeline ? await getInitialStage(pipeline) : null;

  const application = await prisma.application.create({
    data: {
      clientId: parsed.clientId,
      name: parsed.name,
      description: parsed.description,
      assignedUserId: parsed.assignedUserId,
      licenseTypeTemplateId: parsed.licenseTypeTemplateId,
      caseTypeId: parsed.caseTypeId,
      createdById: session.user.id,
      pipeline: pipeline ?? undefined,
      stageId: initialStage?.id,
    },
  });

  if (initialStage) {
    await prisma.stageHistory.create({
      data: { applicationId: application.id, stageId: initialStage.id, actorId: session.user.id },
    });
  }

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
    await notifyApplicationStakeholders(id, application, session.user.id);
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
    await notifyApplicationStakeholders(id, application, session.user.id);
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
      await notifyApplicationStakeholders(id, application, session.user.id);
    }
  }

  revalidatePath("/applications");
  return { count: parsed.ids.length };
}

export async function archiveApplication(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.application.update({ where: { id }, data: { active: false } });

  await recordAudit({ entityType: "Application", entityId: id, action: "archive", actorId: session.user.id });

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
}

export async function restoreApplication(id: string) {
  const session = await requireRole(["ADMIN", "MANAGER"]);
  await prisma.application.update({ where: { id }, data: { active: true } });

  await recordAudit({ entityType: "Application", entityId: id, action: "restore", actorId: session.user.id });

  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
}
