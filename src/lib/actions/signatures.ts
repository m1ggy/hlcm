"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveBuffer, readStoredFile, deleteStoredFile } from "@/lib/storage";

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Buffer.from(base64, "base64");
}

export async function getMySignatureProfile() {
  const session = await requireSession();
  return prisma.signatureProfile.findUnique({ where: { userId: session.user.id } });
}

const saveProfileSchema = z.object({ imageDataUrl: z.string().min(1) });

export async function saveSignatureProfile(input: z.infer<typeof saveProfileSchema>) {
  const session = await requireSession();
  const { imageDataUrl } = saveProfileSchema.parse(input);

  const existing = await prisma.signatureProfile.findUnique({ where: { userId: session.user.id } });
  const { storageKey } = await saveBuffer(dataUrlToBuffer(imageDataUrl), ".png");

  const profile = await prisma.signatureProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, signatureImageKey: storageKey },
    update: { signatureImageKey: storageKey },
  });

  if (existing) await deleteStoredFile(existing.signatureImageKey);

  revalidatePath("/account");
  return profile;
}

export async function deleteSignatureProfile() {
  const session = await requireSession();
  const existing = await prisma.signatureProfile.findUnique({ where: { userId: session.user.id } });
  if (!existing) return;

  await prisma.signatureProfile.delete({ where: { userId: session.user.id } });
  await deleteStoredFile(existing.signatureImageKey);
  revalidatePath("/account");
}

const signSchema = z.object({
  fileAssetId: z.string().min(1),
  applicationId: z.string().min(1),
  imageDataUrl: z.string().min(1),
  pageNumber: z.number().int().min(1),
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  widthRatio: z.number().min(0).max(1),
});

// Flattens a signature image onto a specific page of an existing PDF
// FileAsset, saving the result as a brand-new FileAsset (source stays
// untouched, same "no in-place edits" convention as everything else here).
export async function signDocument(input: z.infer<typeof signSchema>) {
  const parsed = signSchema.parse(input);
  const session = await requireSession();
  await assertApplicationAccess(session, parsed.applicationId, "edit");
  const ipAddress = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: parsed.fileAssetId } });
  if (asset.mimeType !== "application/pdf") throw new Error("Only PDF files can be signed");

  const sourceBuffer = await readStoredFile(asset.storageKey);
  const pdfDoc = await PDFDocument.load(sourceBuffer);
  const pages = pdfDoc.getPages();
  const page = pages[parsed.pageNumber - 1];
  if (!page) throw new Error("Page not found");

  const { width: pageWidth, height: pageHeight } = page.getSize();
  const pngImage = await pdfDoc.embedPng(dataUrlToBuffer(parsed.imageDataUrl));
  const drawWidth = parsed.widthRatio * pageWidth;
  const scaledDims = pngImage.scale(drawWidth / pngImage.width);

  const x = parsed.xRatio * pageWidth;
  const y = pageHeight - parsed.yRatio * pageHeight - scaledDims.height;
  page.drawImage(pngImage, { x, y, width: scaledDims.width, height: scaledDims.height });

  const signedBytes = await pdfDoc.save();
  const { storageKey, sizeBytes } = await saveBuffer(Buffer.from(signedBytes), ".pdf");

  const signedAsset = await prisma.fileAsset.create({
    data: {
      applicationId: parsed.applicationId,
      fileName: `Signed - ${asset.fileName}`,
      storageKey,
      mimeType: "application/pdf",
      sizeBytes,
      uploadedById: session.user.id,
    },
  });

  await prisma.signatureEvent.create({
    data: {
      fileAssetId: signedAsset.id,
      signedById: session.user.id,
      pageNumber: parsed.pageNumber,
      xRatio: parsed.xRatio,
      yRatio: parsed.yRatio,
      widthRatio: parsed.widthRatio,
      heightRatio: scaledDims.height / pageHeight,
      ipAddress,
    },
  });

  await recordAudit({
    entityType: "Application",
    entityId: parsed.applicationId,
    action: "sign_document",
    actorId: session.user.id,
    field: "file",
    newValue: signedAsset.fileName,
  });

  revalidatePath(`/applications/${parsed.applicationId}`);
  return signedAsset;
}
