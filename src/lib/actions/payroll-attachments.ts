"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession, isManagement, ForbiddenError } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";

// Payroll files belong to one person's payment (pay stub, deposit slip):
// visible to payroll managers and to that person only. There are no
// period-wide files (user's call, 2026-11-04) — the table still allows a
// null payrollPaymentId because the first release had them; any such row
// shows on /payroll as an "Older period files" list until it's deleted.
// Only the accountant (+ OWNER/DEVELOPER) adds or removes files.

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".pdf", ".csv", ".xlsx", ".docx"]);

class PayrollFileError extends UserFacingError {}

function checkFile(file: FormDataEntryValue | null): File {
  if (!(file instanceof File) || file.size === 0) throw new PayrollFileError("Choose a file to upload");
  if (file.size > MAX_FILE_BYTES) throw new PayrollFileError("File is larger than 20MB");
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
    throw new PayrollFileError("Only images, PDF, .csv, .xlsx and .docx files can be added");
  }
  return file;
}

async function uploadImpl(paymentId: string, formData: FormData) {
  const session = await requireRole(["ACCOUNTANT"]);
  const file = checkFile(formData.get("file"));

  const payment = await prisma.payrollPayment.findUnique({ where: { id: paymentId }, select: { id: true, payPeriodId: true } });
  if (!payment) throw new PayrollFileError("That payment was undone — refresh the page");

  const { storageKey, sizeBytes } = await saveUploadedFile(file);
  const attachment = await prisma.payrollAttachment.create({
    data: {
      payPeriodId: payment.payPeriodId,
      payrollPaymentId: payment.id,
      fileName: file.name,
      storageKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes,
      uploadedById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "PayrollPayment",
    entityId: payment.id,
    action: "upload_attachment",
    actorId: session.user.id,
    field: "attachment",
    newValue: file.name,
  });

  revalidatePath("/payroll");
  revalidatePath("/time");
  revalidatePath("/hours");
  return { id: attachment.id };
}

export async function uploadPayrollAttachment(paymentId: string, formData: FormData) {
  return toActionResult(() => uploadImpl(paymentId, formData));
}

async function deleteImpl(id: string) {
  const session = await requireRole(["ACCOUNTANT"]);
  const attachment = await prisma.payrollAttachment.findUnique({ where: { id } });
  if (!attachment) throw new PayrollFileError("That file is already gone — refresh the page");

  await prisma.payrollAttachment.delete({ where: { id } });
  await deleteStoredFile(attachment.storageKey);

  await recordAudit({
    entityType: attachment.payrollPaymentId ? "PayrollPayment" : "PayPeriod",
    entityId: attachment.payrollPaymentId ?? attachment.payPeriodId,
    action: "delete_attachment",
    actorId: session.user.id,
    field: "attachment",
    oldValue: attachment.fileName,
  });

  revalidatePath("/payroll");
  revalidatePath("/time");
  revalidatePath("/hours");
}

export async function deletePayrollAttachment(id: string) {
  return toActionResult(() => deleteImpl(id));
}

/** For the download route: management sees every payroll file; anyone else
 * only files on their own payments. */
export async function getPayrollAttachment(id: string) {
  const session = await requireSession();
  const attachment = await prisma.payrollAttachment.findUniqueOrThrow({
    where: { id },
    include: { payrollPayment: { select: { userId: true } } },
  });
  if (isManagement(session.user.role)) return attachment;
  if (attachment.payrollPayment?.userId === session.user.id) return attachment;
  throw new ForbiddenError();
}
