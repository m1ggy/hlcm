"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { CLIENT_FIELD_OPTIONS } from "@/lib/form-client-fields";

const FIELD_TYPES = ["TEXT", "LONG_TEXT", "EMAIL", "PHONE", "DATE", "SELECT", "CHECKBOX", "FILE"] as const;

// Reading the list (to pick a form to send someone, or grab its public
// link) is open to anyone who can create a client — building/editing one
// is ADMIN-only, same split Document Templates already uses.
export async function listFormTemplates() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.formTemplate.findMany({
    include: { fields: { orderBy: { sortOrder: "asc" } }, _count: { select: { submissions: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFormTemplate(id: string) {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.formTemplate.findUniqueOrThrow({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
}

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).default([]),
  clientField: z.enum(CLIENT_FIELD_OPTIONS).optional(),
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Link is required")
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and dashes"),
  description: z.string().optional(),
  fields: z.array(fieldSchema).min(1, "Add at least one field"),
});

export async function createFormTemplate(input: z.infer<typeof createSchema>) {
  const session = await requireRole(["ADMIN"]);
  const parsed = createSchema.parse(input);

  const template = await prisma.formTemplate
    .create({
      data: {
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description || undefined,
        createdById: session.user.id,
        fields: {
          create: parsed.fields.map((f, i) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.type === "SELECT" ? f.options : [],
            clientField: f.clientField,
            sortOrder: i,
          })),
        },
      },
      include: { fields: true },
    })
    .catch((e) =>
      friendlyPrismaError(e, {
        duplicateMessages: {
          slug: "That link is already in use by another form — pick a different one",
          "templateId,key": "Two fields have the same key — each field's key must be unique on this form",
        },
      })
    );

  await recordAudit({ entityType: "FormTemplate", entityId: template.id, action: "create", actorId: session.user.id });

  revalidatePath("/admin/forms");
  return template;
}

const updateSchema = createSchema.extend({
  active: z.boolean(),
});

export async function updateFormTemplate(id: string, input: z.infer<typeof updateSchema>) {
  const session = await requireRole(["ADMIN"]);
  const parsed = updateSchema.parse(input);

  const template = await prisma
    .$transaction(async (tx) => {
      await tx.formField.deleteMany({ where: { templateId: id } });
      return tx.formTemplate.update({
        where: { id },
        data: {
          name: parsed.name,
          slug: parsed.slug,
          description: parsed.description || undefined,
          active: parsed.active,
          fields: {
            create: parsed.fields.map((f, i) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required,
              options: f.type === "SELECT" ? f.options : [],
              clientField: f.clientField,
              sortOrder: i,
            })),
          },
        },
        include: { fields: true },
      });
    })
    .catch((e) =>
      friendlyPrismaError(e, {
        duplicateMessages: {
          slug: "That link is already in use by another form — pick a different one",
          "templateId,key": "Two fields have the same key — each field's key must be unique on this form",
        },
      })
    );

  await recordAudit({ entityType: "FormTemplate", entityId: id, action: "update", actorId: session.user.id });

  revalidatePath("/admin/forms");
  revalidatePath(`/forms/${parsed.slug}`);
  return template;
}
