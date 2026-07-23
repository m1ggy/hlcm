"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";
import { extractMergeTags } from "@/lib/docx-merge";

// Every internal role needs to read these to generate documents on an
// Application; only Admins manage them — same split as License Types.
export async function listDocumentTemplates() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.documentTemplate.findMany({
    where: { active: true },
    include: { licenseTypeTemplate: { select: { name: true } }, fields: true },
    orderBy: { name: "asc" },
  });
}

// Step 1 of template creation: stash the uploaded .docx and scan it for merge
// tags so the admin maps each one to AUTO/CUSTOM before the template exists.
export async function uploadTemplateDraft(formData: FormData) {
  await requireRole(["ADMIN"]);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a .docx file to upload");
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Template must be a .docx file");
  }

  const { storageKey } = await saveUploadedFile(file);
  const buffer = Buffer.from(await file.arrayBuffer());

  let tags: string[];
  try {
    tags = extractMergeTags(buffer);
  } catch {
    await deleteStoredFile(storageKey);
    throw new Error("Couldn't read that file as a .docx");
  }

  return { storageKey, fileName: file.name, tags };
}

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  source: z.enum(["AUTO", "CUSTOM"]),
  autoField: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  licenseTypeTemplateId: z.string().optional(),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  fields: z.array(fieldSchema),
});

export async function createDocumentTemplate(input: z.infer<typeof createSchema>) {
  const session = await requireRole(["ADMIN"]);
  const parsed = createSchema.parse(input);

  const template = await prisma.documentTemplate.create({
    data: {
      name: parsed.name,
      description: parsed.description || undefined,
      licenseTypeTemplateId: parsed.licenseTypeTemplateId || undefined,
      storageKey: parsed.storageKey,
      fileName: parsed.fileName,
      createdById: session.user.id,
      fields: {
        create: parsed.fields.map((f, i) => ({
          key: f.key,
          label: f.label,
          source: f.source,
          autoField: f.source === "AUTO" ? f.autoField : undefined,
          sortOrder: i,
        })),
      },
    },
  });

  await recordAudit({
    entityType: "DocumentTemplate",
    entityId: template.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/admin/document-templates");
  return template;
}

export async function deactivateDocumentTemplate(id: string) {
  const session = await requireRole(["ADMIN"]);
  await prisma.documentTemplate.update({ where: { id }, data: { active: false } });

  await recordAudit({
    entityType: "DocumentTemplate",
    entityId: id,
    action: "deactivate",
    actorId: session.user.id,
  });

  revalidatePath("/admin/document-templates");
}
