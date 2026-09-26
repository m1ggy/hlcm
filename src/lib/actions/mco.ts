"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { getInitialStage } from "@/lib/pipeline";
import { resolveStageChange, isStructurallyReachable, daysInStage } from "@/lib/stage-transitions";
import { isPicklistCode } from "@/lib/picklists";

export async function listMcoCredentialsForClient(clientId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const credentials = await db.mcoCredential.findMany({
    where: { clientId },
    include: {
      stage: true,
      assignedUser: true,
      assignedManager: true,
      stageHistory: { orderBy: { enteredAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  // Spec field: "Days in current stage" — same rule as Applications.
  return credentials.map((c) => {
    const latest = c.stageHistory[0];
    return { ...c, daysInStage: c.stage && latest ? daysInStage(latest.enteredAt) : null };
  });
}

// One row per client per MCO (unique on clientId+mcoName) — the dialog
// filters out MCOs the client is already credentialing with, but the
// constraint is what actually prevents the duplicate if two people submit
// at once.
// `mcoName` is a code from the org's PAYER list (src/lib/picklists.ts).
export async function createMcoCredential(clientId: string, mcoName: string) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  if (!(await isPicklistCode("PAYER", mcoName))) {
    throw new Error(`Unknown MCO "${mcoName}".`);
  }

  const initialStage = await getInitialStage("MCO");
  if (!initialStage) {
    throw new Error("No MCO pipeline stages configured — run the stage seed first.");
  }

  const credential = await db.mcoCredential
    .create({
      data: { clientId, mcoName, stageId: initialStage.id, createdById: session.user.id },
    })
    .catch((e) =>
      friendlyPrismaError(e, { duplicateMessages: { "clientId,mcoName": "This client already has a credential in progress for that MCO" } })
    );

  await db.stageHistory.create({
    data: { mcoCredentialId: credential.id, stageId: initialStage.id, actorId: session.user.id },
  });

  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "add_mco",
    actorId: session.user.id,
    newValue: mcoName,
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

  const credential = await db.mcoCredential.findUniqueOrThrow({
    where: { id: mcoCredentialId },
    include: { stage: true },
  });
  if (!credential.stage) {
    throw new Error("This MCO credential doesn't have a stage set yet — contact an admin.");
  }

  const targetStage = await db.pipelineStage.findUniqueOrThrow({ where: { id: targetStageId } });

  const followUpDate = opts.followUpDate ? new Date(opts.followUpDate) : null;
  const result = resolveStageChange(credential.stage, targetStage, { reason: opts.reason, followUpDate });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const [updated] = await db.$transaction(async (tx) => [
    await tx.mcoCredential.update({ where: { id: mcoCredentialId }, data: { stageId: targetStage.id } }),
    await tx.stageHistory.create({
      data: {
        mcoCredentialId,
        stageId: targetStage.id,
        reason: opts.reason?.trim() || null,
        followUpDate,
        actorId: session.user.id,
      },
    }),
  ] as const);

  await recordAudit({
    entityType: "Client",
    entityId: credential.clientId,
    action: "change_mco_stage",
    actorId: session.user.id,
    oldValue: `${credential.mcoName}:${credential.stage.name}`,
    newValue: `${credential.mcoName}:${targetStage.name}`,
  });

  revalidatePath(`/clients/${credential.clientId}`);
  return updated;
}

// Same idea as listReachableStages for Applications (src/lib/actions/stage.ts)
// — lets the picker grey out disallowed targets instead of letting someone
// pick one and then get rejected.
export async function listReachableMcoStages(mcoCredentialId: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);

  const credential = await db.mcoCredential.findUniqueOrThrow({
    where: { id: mcoCredentialId },
    include: { stage: true },
  });
  if (!credential.stage) return [];

  const allStages = await db.pipelineStage.findMany({
    where: { pipeline: "MCO", active: true },
    orderBy: { sortOrder: "asc" },
  });

  return allStages
    .filter((s) => s.id !== credential.stage!.id)
    .map((s) => ({ ...s, reachable: isStructurallyReachable(credential.stage!, s) }));
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

  const before = await db.mcoCredential.findUniqueOrThrow({ where: { id } });
  const credential = await db.mcoCredential.update({
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
    entityType: "Client",
    entityId: credential.clientId,
    actorId: session.user.id,
    action: "update_mco",
    before,
    after: credential,
  });

  revalidatePath(`/clients/${credential.clientId}`);
  return credential;
}
