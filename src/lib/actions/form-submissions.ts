"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import type { $Enums } from "@/generated/prisma/client";

const REVIEW_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

export async function listFormSubmissions(status?: $Enums.FormSubmissionStatus) {
  await requireRole([...REVIEW_ROLES]);
  return prisma.formSubmission.findMany({
    where: { status },
    include: {
      template: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
      client: { select: { id: true, name: true } },
      files: { select: { id: true, fieldKey: true, fileName: true, sizeBytes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFormSubmission(id: string) {
  await requireRole([...REVIEW_ROLES]);
  return prisma.formSubmission.findUniqueOrThrow({
    where: { id },
    include: {
      template: { include: { fields: { orderBy: { sortOrder: "asc" } } } },
      client: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      files: true,
    },
  });
}

// Linking is the shared last step whether a brand-new Client was just
// created from this submission's answers, or it was matched to one that
// already exists — createClient itself (src/lib/actions/clients.ts) is
// called directly by the review UI beforehand for the "new client" case,
// so this file never duplicates client-creation logic.
export async function linkSubmissionToClient(submissionId: string, clientId: string) {
  const session = await requireRole([...REVIEW_ROLES]);

  await prisma.formSubmission
    .update({
      where: { id: submissionId },
      data: { clientId, status: "REVIEWED", reviewedById: session.user.id, reviewedAt: new Date() },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That submission is already gone" }));

  await recordAudit({
    entityType: "FormSubmission",
    entityId: submissionId,
    action: "link_client",
    actorId: session.user.id,
    newValue: clientId,
  });

  revalidatePath("/admin/forms/inbox");
}

export async function dismissSubmission(id: string) {
  const session = await requireRole([...REVIEW_ROLES]);

  await prisma.formSubmission
    .update({
      where: { id },
      data: { status: "DISMISSED", reviewedById: session.user.id, reviewedAt: new Date() },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That submission is already gone" }));

  await recordAudit({ entityType: "FormSubmission", entityId: id, action: "dismiss", actorId: session.user.id });

  revalidatePath("/admin/forms/inbox");
}

// Used by the download route (src/app/api/form-submissions/[id]/files/
// [fileId]/route.ts) — routes the auth check through requireRole the same
// way getInvoiceAttachment does, rather than duplicating it inline.
export async function getFormSubmissionFile(fileId: string) {
  await requireRole([...REVIEW_ROLES]);
  return prisma.formSubmissionFile.findUniqueOrThrow({ where: { id: fileId } });
}
