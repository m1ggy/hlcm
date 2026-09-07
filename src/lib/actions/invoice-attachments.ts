"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";

const MANAGE_ROLES: AppRole[] = ["ADMIN", "MANAGER"];

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep well under bodySizeLimit's 25MB, same cap as files.ts

// Images, PDF, and the two Office formats staff actually send around for
// invoices (signed contracts, receipts, spreadsheets). Checked by mimeType
// AND filename extension — some browsers send a generic/empty type for
// .xlsx/.docx, so extension is the more reliable signal for those two.
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".pdf", ".xlsx", ".docx"]);

function assertAllowedType(file: File) {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Only images, PDF, .xlsx, and .docx files can be attached to an invoice");
  }
}

export async function listInvoiceAttachments(invoiceId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.invoiceAttachment.findMany({
    where: { invoiceId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function uploadInvoiceAttachment(invoiceId: string, formData: FormData) {
  const session = await requireRole(MANAGE_ROLES);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 20MB");
  }
  assertAllowedType(file);

  await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true } });

  const { storageKey, sizeBytes } = await saveUploadedFile(file);
  const mimeType = file.type || "application/octet-stream";

  const attachment = await prisma.invoiceAttachment.create({
    data: {
      invoiceId,
      fileName: file.name,
      storageKey,
      mimeType,
      sizeBytes,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  await recordAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "upload_attachment",
    actorId: session.user.id,
    field: "attachment",
    newValue: file.name,
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return attachment;
}

export async function deleteInvoiceAttachment(attachmentId: string, invoiceId: string) {
  const session = await requireRole(MANAGE_ROLES);

  const attachment = await prisma.invoiceAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
  if (attachment.invoiceId !== invoiceId) throw new Error("Attachment does not belong to this invoice");

  await prisma.invoiceAttachment
    .delete({ where: { id: attachmentId } })
    .catch((e) =>
      friendlyPrismaError(e, {
        notFoundMessage: "That attachment is already gone — someone else may have just deleted it",
      })
    );
  await deleteStoredFile(attachment.storageKey);

  await recordAudit({
    entityType: "Invoice",
    entityId: invoiceId,
    action: "delete_attachment",
    actorId: session.user.id,
    field: "attachment",
    oldValue: attachment.fileName,
  });

  revalidatePath(`/invoices/${invoiceId}`);
}

// Used by the download route (src/app/api/invoice-attachments/[id]/route.ts)
// — routes the auth check through requireRole the same way getReceipt does,
// rather than duplicating the role check inline in the route.
export async function getInvoiceAttachment(attachmentId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.invoiceAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
}
