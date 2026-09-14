"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, assertApplicationAccess, AppRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { readStoredFile } from "@/lib/storage";
import { createEnvelope as docusignCreateEnvelope, voidEnvelope as docusignVoidEnvelope } from "@/lib/docusign";

// Same reviewer tier as files.ts/client-agreements.ts — Clients have no
// per-record access-grant concept the way Applications do, so the
// Client-agreement send path is a flat role gate; the Application path
// reuses assertApplicationAccess like every other Application sub-record.
const MANAGE_ROLES: AppRole[] = ["ADMIN", "MANAGER", "STAFF"];

const baseFields = {
  fileAssetId: z.string().min(1),
  signerName: z.string().min(1, "Signer name is required"),
  signerEmail: z.string().min(1, "Signer email is required").email("Enter a valid email address"),
  pageNumber: z.number().int().min(1),
  xRatio: z.number().min(0).max(1),
  yRatio: z.number().min(0).max(1),
  expirationDays: z.number().int().min(1).max(365).optional(),
};

const applicationSendSchema = z.object({ applicationId: z.string().min(1), ...baseFields });
const clientAgreementSendSchema = z.object({ clientAgreementId: z.string().min(1), ...baseFields });

// Shared implementation — verifies the source file is a PDF that actually
// belongs to the stated parent (never trust a fileAssetId blindly across
// contexts), reads its page size to convert the click-placed ratio into
// DocuSign's points-from-top-left tab position (see src/lib/docusign.ts for
// why no Y-flip is needed here, unlike the retired pdf-lib flatten), sends
// via DocuSign, and records the envelope.
async function sendEnvelope(
  parent: { entityType: "Application"; entityId: string; applicationId: string } | { entityType: "Client"; entityId: string; clientAgreementId: string },
  input: {
    fileAssetId: string;
    signerName: string;
    signerEmail: string;
    pageNumber: number;
    xRatio: number;
    yRatio: number;
    expirationDays?: number;
  },
  sentById: string
) {
  const asset = await prisma.fileAsset.findUniqueOrThrow({ where: { id: input.fileAssetId } });
  if (asset.mimeType !== "application/pdf") throw new Error("Only PDF files can be sent for signature");
  if (parent.entityType === "Application" && asset.applicationId !== parent.applicationId) {
    throw new Error("That file doesn't belong to this application");
  }
  if (parent.entityType === "Client" && asset.clientId !== parent.entityId) {
    throw new Error("That file doesn't belong to this client");
  }

  const buffer = await readStoredFile(asset.storageKey);
  const pdfDoc = await PDFDocument.load(buffer);
  const page = pdfDoc.getPages()[input.pageNumber - 1];
  if (!page) throw new Error("Page not found");
  const { width, height } = page.getSize();

  const { envelopeId } = await docusignCreateEnvelope({
    documentBuffer: buffer,
    documentName: asset.fileName,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    pageNumber: input.pageNumber,
    xPosition: Math.round(input.xRatio * width),
    yPosition: Math.round(input.yRatio * height),
    expirationDays: input.expirationDays,
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expirationDays ?? 30) * 24 * 60 * 60 * 1000);

  const envelope = await prisma.docusignEnvelope.create({
    data: {
      applicationId: parent.entityType === "Application" ? parent.applicationId : undefined,
      clientAgreementId: parent.entityType === "Client" ? parent.clientAgreementId : undefined,
      sourceFileAssetId: asset.id,
      docusignEnvelopeId: envelopeId,
      status: "SENT",
      signerName: input.signerName,
      signerEmail: input.signerEmail,
      pageNumber: input.pageNumber,
      xRatio: input.xRatio,
      yRatio: input.yRatio,
      expiresAt,
      sentById,
      sentAt: now,
    },
  });

  // A real user action, not webhook-originated — safe to attribute
  // directly, unlike the webhook route's status updates.
  await recordAudit({
    entityType: parent.entityType,
    entityId: parent.entityId,
    action: "send_envelope",
    actorId: sentById,
    field: "file",
    newValue: `Sent "${asset.fileName}" to ${input.signerEmail} for signature`,
  });

  return envelope;
}

export async function createAndSendEnvelopeForApplication(input: z.infer<typeof applicationSendSchema>) {
  const session = await requireSession();
  const parsed = applicationSendSchema.parse(input);
  await assertApplicationAccess(session, parsed.applicationId, "edit");

  const envelope = await sendEnvelope(
    { entityType: "Application", entityId: parsed.applicationId, applicationId: parsed.applicationId },
    parsed,
    session.user.id
  );
  revalidatePath(`/applications/${parsed.applicationId}`);
  return envelope;
}

export async function createAndSendEnvelopeForClientAgreement(input: z.infer<typeof clientAgreementSendSchema>) {
  const session = await requireRole(MANAGE_ROLES);
  const parsed = clientAgreementSendSchema.parse(input);
  const agreement = await prisma.clientAgreement.findUniqueOrThrow({
    where: { id: parsed.clientAgreementId },
    select: { clientId: true },
  });

  const envelope = await sendEnvelope(
    { entityType: "Client", entityId: agreement.clientId, clientAgreementId: parsed.clientAgreementId },
    parsed,
    session.user.id
  );
  revalidatePath(`/clients/${agreement.clientId}`);
  return envelope;
}

export async function listEnvelopesForApplication(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  return prisma.docusignEnvelope.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } });
}

export async function listEnvelopesForClientAgreement(clientAgreementId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.docusignEnvelope.findMany({ where: { clientAgreementId }, orderBy: { createdAt: "desc" } });
}

// A real operational necessity ("sent to the wrong person") — kept in v1,
// unlike resend (deferred: DocuSign's resend is just a reminder nudge on an
// already-sent envelope, not a new one; staff can void-and-recreate
// meanwhile).
export async function voidEnvelope(envelopeId: string, reason: string) {
  const session = await requireRole(MANAGE_ROLES);
  const envelope = await prisma.docusignEnvelope.findUniqueOrThrow({ where: { id: envelopeId } });
  if (envelope.status === "COMPLETED" || envelope.status === "VOIDED" || envelope.status === "DECLINED") {
    throw new Error("This envelope is already finished and can't be voided");
  }

  await docusignVoidEnvelope(envelope.docusignEnvelopeId, reason);
  await prisma.docusignEnvelope.update({
    where: { id: envelopeId },
    data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason },
  });

  const entityType = envelope.applicationId ? "Application" : "Client";
  const entityId = envelope.applicationId ?? (await clientIdForAgreement(envelope.clientAgreementId));
  if (entityId) {
    await recordAudit({ entityType, entityId, action: "void_envelope", actorId: session.user.id, field: "file", newValue: reason });
  }

  if (envelope.applicationId) revalidatePath(`/applications/${envelope.applicationId}`);
  else if (entityId) revalidatePath(`/clients/${entityId}`);

  return envelope;
}

async function clientIdForAgreement(clientAgreementId: string | null) {
  if (!clientAgreementId) return null;
  const agreement = await prisma.clientAgreement.findUnique({ where: { id: clientAgreementId }, select: { clientId: true } });
  return agreement?.clientId ?? null;
}
