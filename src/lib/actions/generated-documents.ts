"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { readStoredFile, saveBuffer, deleteStoredFile } from "@/lib/storage";
import { mergeDocx } from "@/lib/docx-merge";
import { resolveAutoField } from "@/lib/merge-fields";

export async function listApplicableTemplates(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { licenseTypeTemplateId: true },
  });

  return prisma.documentTemplate.findMany({
    where: {
      active: true,
      OR: [{ licenseTypeTemplateId: null }, { licenseTypeTemplateId: application.licenseTypeTemplateId }],
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function listGeneratedDocuments(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  return prisma.generatedDocument.findMany({
    where: { applicationId },
    include: {
      template: { select: { name: true } },
      generatedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

const generateSchema = z.object({
  applicationId: z.string().min(1),
  templateId: z.string().min(1),
  customValues: z.record(z.string(), z.string()),
});

export async function generateDocument(input: z.infer<typeof generateSchema>) {
  const { applicationId, templateId, customValues } = generateSchema.parse(input);
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const template = await prisma.documentTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: { fields: true },
  });

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { licenseTypeTemplate: true, caseType: true, client: true },
  });

  const ctx = { application, client: application.client, staffName: session.user.name ?? "" };

  const fieldValues: Record<string, string> = {};
  for (const field of template.fields) {
    fieldValues[field.key] =
      field.source === "AUTO" ? resolveAutoField(field.autoField ?? "", ctx) : customValues[field.key] ?? "";
  }

  const templateBuffer = await readStoredFile(template.storageKey);
  const merged = mergeDocx(templateBuffer, fieldValues);
  const fileName = `${template.name} - ${application.name}.docx`;
  const { storageKey } = await saveBuffer(merged, ".docx");

  const doc = await prisma.generatedDocument.create({
    data: {
      templateId,
      applicationId,
      fileName,
      storageKey,
      fieldValues,
      generatedById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "generate_document",
    actorId: session.user.id,
    field: "document",
    newValue: fileName,
  });

  revalidatePath(`/applications/${applicationId}`);
  return doc;
}

const statusSchema = z.enum(["DRAFT", "APPROVED", "SENT"]);

export async function updateGeneratedDocumentStatus(
  id: string,
  applicationId: string,
  status: z.infer<typeof statusSchema>
) {
  const parsedStatus = statusSchema.parse(status);
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const doc = await prisma.generatedDocument.update({ where: { id }, data: { status: parsedStatus } });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "update_document_status",
    actorId: session.user.id,
    field: "document_status",
    newValue: `${doc.fileName}:${status}`,
  });

  revalidatePath(`/applications/${applicationId}`);
  return doc;
}

export async function deleteGeneratedDocument(id: string, applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const doc = await prisma.generatedDocument.findUniqueOrThrow({ where: { id } });
  await prisma.generatedDocument.delete({ where: { id } });
  await deleteStoredFile(doc.storageKey);

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "delete_document",
    actorId: session.user.id,
    field: "document",
    oldValue: doc.fileName,
  });

  revalidatePath(`/applications/${applicationId}`);
}
