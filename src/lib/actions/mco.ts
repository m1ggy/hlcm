"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { getInitialStage } from "@/lib/pipeline";
import { resolveStageChange } from "@/lib/stage-transitions";

const MCO_NAMES = ["AETNA", "BCBS_IL", "COUNTY_CARE", "HUMANA", "MERIDIAN", "MOLINA", "OTHER"] as const;

export async function listMcoCredentialsForClient(clientId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.mcoCredential.findMany({
    where: { clientId },
    include: { stage: true, assignedUser: true, assignedManager: true },
    orderBy: { createdAt: "asc" },
  });
}

// One row per client per MCO (unique on clientId+mcoName) — the dialog
// filters out MCOs the client is already credentialing with, but the
// constraint is what actually prevents the duplicate if two people submit
// at once.
export async function createMcoCredential(clientId: string, mcoName: (typeof MCO_NAMES)[number]) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  if (!MCO_NAMES.includes(mcoName)) {
    throw new Error(`Unknown MCO "${mcoName}".`);
  }

  const initialStage = await getInitialStage("MCO");
  if (!initialStage) {
    throw new Error("No MCO pipeline stages configured — run the stage seed first.");
  }

  const credential = await prisma.mcoCredential.create({
    data: { clientId, mcoName, stageId: initialStage.id, createdById: session.user.id },
  });

  await prisma.stageHistory.create({
    data: { mcoCredentialId: credential.id, stageId: initialStage.id, actorId: session.user.id },
  });

  await recordAudit({
    entityType: "McoCredential",
    entityId: credential.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath(`/clients/${clientId}`);
  return credential;
}

// Same rules as changeApplicationStage (forward/exit always allowed,
// backward only via the stage's own whitelist) — MCO Denied -> MCO
// Completing Application is exactly this kind of whitelisted backward move
// (reapplying after a denial).
export async function changeMcoStage(
  mcoCredentialId: string,
  targetStageId: string,
  opts: { reason?: string; followUpDate?: string } = {}
) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);

  const credential = await prisma.mcoCredential.findUniqueOrThrow({
    where: { id: mcoCredentialId },
    include: { stage: true },
  });
  if (!credential.stage) {
    throw new Error("This MCO credential doesn't have a stage set yet — contact an admin.");
  }

  const targetStage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: targetStageId } });

  const followUpDate = opts.followUpDate ? new Date(opts.followUpDate) : null;
  const result = resolveStageChange(credential.stage, targetStage, { reason: opts.reason, followUpDate });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const [updated] = await prisma.$transaction([
    prisma.mcoCredential.update({ where: { id: mcoCredentialId }, data: { stageId: targetStage.id } }),
    prisma.stageHistory.create({
      data: {
        mcoCredentialId,
        stageId: targetStage.id,
        reason: opts.reason?.trim() || null,
        followUpDate,
        actorId: session.user.id,
      },
    }),
  ]);

  await recordAudit({
    entityType: "McoCredential",
    entityId: mcoCredentialId,
    action: "change_stage",
    actorId: session.user.id,
    oldValue: credential.stage.name,
    newValue: targetStage.name,
  });

  revalidatePath(`/clients/${credential.clientId}`);
  return updated;
}

function parseNullableDate(raw: FormDataEntryValue | null): Date | null | undefined {
  if (raw === null) return undefined;
  const value = raw.toString();
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function updateMcoCredential(id: string, formData: FormData) {
  const session = await requireSession();
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);

  const before = await prisma.mcoCredential.findUniqueOrThrow({ where: { id } });
  const credential = await prisma.mcoCredential.update({
    where: { id },
    data: {
      npi: (formData.get("npi")?.toString() || null),
      providerId: (formData.get("providerId")?.toString() || null),
      effectiveDate: parseNullableDate(formData.get("effectiveDate")),
      recredentialingDueDate: parseNullableDate(formData.get("recredentialingDueDate")),
      assignedUserId: (formData.get("assignedUserId")?.toString() || null),
      assignedManagerId: (formData.get("assignedManagerId")?.toString() || null),
    },
  });

  await recordFieldChanges({
    entityType: "McoCredential",
    entityId: id,
    actorId: session.user.id,
    action: "update",
    before,
    after: credential,
  });

  revalidatePath(`/clients/${credential.clientId}`);
  return credential;
}
