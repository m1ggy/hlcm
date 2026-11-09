"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import type { $Enums } from "@/generated/prisma/client";

const REVIEW_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

export async function listFormSubmissions(status?: $Enums.FormSubmissionStatus) {
  await requireRole([...REVIEW_ROLES]);
  return db.formSubmission.findMany({
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
  return db.formSubmission.findUniqueOrThrow({
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

  await db.formSubmission
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

  revalidatePath("/intake", "layout");
}

export async function dismissSubmission(id: string) {
  const session = await requireRole([...REVIEW_ROLES]);

  await db.formSubmission
    .update({
      where: { id },
      data: { status: "DISMISSED", reviewedById: session.user.id, reviewedAt: new Date() },
    })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That submission is already gone" }));

  await recordAudit({ entityType: "FormSubmission", entityId: id, action: "dismiss", actorId: session.user.id });

  revalidatePath("/intake", "layout");
}

/** Marks a submission handled without creating or attaching a client. */
export async function markSubmissionReviewed(id: string) {
  return toActionResult(async () => {
    const session = await requireRole([...REVIEW_ROLES]);
    await db.formSubmission
      .update({ where: { id }, data: { status: "REVIEWED", reviewedById: session.user.id, reviewedAt: new Date() } })
      .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That submission is already gone" }));
    await recordAudit({ entityType: "FormSubmission", entityId: id, action: "mark_reviewed", actorId: session.user.id });
    revalidatePath("/intake", "layout");
  });
}

/** Back to New (undo Reviewed/Dismissed). Keeps any client it was attached to. */
export async function reopenSubmission(id: string) {
  return toActionResult(async () => {
    const session = await requireRole([...REVIEW_ROLES]);
    await db.formSubmission
      .update({ where: { id }, data: { status: "PENDING", reviewedById: null, reviewedAt: null } })
      .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That submission is already gone" }));
    await recordAudit({ entityType: "FormSubmission", entityId: id, action: "reopen", actorId: session.user.id });
    revalidatePath("/intake", "layout");
  });
}

/** The team's own note on a submission (never shown to the person who filled it in). */
export async function saveSubmissionNote(id: string, note: string) {
  return toActionResult(async () => {
    const session = await requireRole([...REVIEW_ROLES]);
    const text = note.trim().slice(0, 5000) || null;
    const before = await db.formSubmission.findUnique({ where: { id }, select: { note: true } });
    if (!before) throw new UserFacingError("That submission is already gone");
    await db.formSubmission.update({ where: { id }, data: { note: text } });
    await recordAudit({ entityType: "FormSubmission", entityId: id, action: "note", actorId: session.user.id, oldValue: before.note, newValue: text });
    revalidatePath("/intake", "layout");
  });
}

// Used by the download route (src/app/api/form-submissions/[id]/files/
// [fileId]/route.ts) — routes the auth check through requireRole the same
// way getInvoiceAttachment does, rather than duplicating it inline.
export async function getFormSubmissionFile(fileId: string) {
  await requireRole([...REVIEW_ROLES]);
  return db.formSubmissionFile.findUniqueOrThrow({ where: { id: fileId } });
}
