"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { CLIENT_FIELD_OPTIONS } from "@/lib/form-client-fields";
import { EMAIL_RE, FORM_FIELD_TYPES, SHOW_IF_OPS, hasOptions, isLayoutField } from "@/lib/form-logic";

// Building forms (docs/forms-plan.md, Phase 2). Managers and admins build
// and edit them (it used to be admins only, buried under Admin); anyone who
// reviews submissions can see the list and copy a link.

const MANAGE_ROLES = ["ADMIN", "MANAGER"] as const;
const VIEW_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

function refresh(slug?: string) {
  revalidatePath("/intake", "layout");
  if (slug) revalidatePath(`/forms/${slug}`);
}

function validateNotifyEmails(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const emails = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const email of emails) if (!EMAIL_RE.test(email)) throw new UserFacingError(`"${email}" doesn't look like a valid email`);
  return emails.join(", ");
}

export async function listFormTemplates() {
  await requireRole([...VIEW_ROLES]);
  return db.formTemplate.findMany({
    include: { fields: { orderBy: { sortOrder: "asc" } }, _count: { select: { submissions: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFormTemplate(id: string) {
  await requireRole([...VIEW_ROLES]);
  return db.formTemplate.findUnique({ where: { id }, include: { fields: { orderBy: { sortOrder: "asc" } }, _count: { select: { submissions: true } } } });
}

const showIfSchema = z
  .object({ key: z.string().min(1), op: z.enum(Object.keys(SHOW_IF_OPS) as [keyof typeof SHOW_IF_OPS, ...(keyof typeof SHOW_IF_OPS)[]]), value: z.string().optional() })
  .nullable()
  .optional();

const fieldSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/, "Field keys use lowercase letters, numbers and _"),
  label: z.string().trim().min(1, "Every field needs a label").max(500),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).default([]),
  clientField: z.enum(CLIENT_FIELD_OPTIONS).nullable().optional(),
  helpText: z.string().max(2000).nullable().optional(),
  placeholder: z.string().max(200).nullable().optional(),
  showIf: showIfSchema,
});

const formSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name").max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Pick a link")
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "The link uses lowercase letters, numbers and dashes"),
  description: z.string().max(5000).nullable().optional(),
  active: z.boolean().default(true),
  thankYouMessage: z.string().max(2000).nullable().optional(),
  sendCopyToSubmitter: z.boolean().default(false),
  notifyUserIds: z.array(z.string()).default([]),
  notifyEmails: z.string().nullable().optional(),
  notifyTextUserIds: z.array(z.string()).default([]),
  fields: z.array(fieldSchema).min(1, "Add at least one question"),
});

export type FormTemplateInput = z.input<typeof formSchema>;

function checkFields(fields: z.infer<typeof fieldSchema>[]) {
  const keys = new Set<string>();
  for (const [i, f] of fields.entries()) {
    if (keys.has(f.key)) throw new UserFacingError(`Two questions share the key "${f.key}"`);
    keys.add(f.key);
    if (hasOptions(f.type) && f.options.length === 0) throw new UserFacingError(`"${f.label}" needs at least one option`);
    if (f.showIf) {
      const target = fields.findIndex((t) => t.key === f.showIf!.key);
      if (target === -1 || target >= i) throw new UserFacingError(`"${f.label}" can only depend on a question above it`);
      if (isLayoutField(fields[target].type) || fields[target].type === "FILE") throw new UserFacingError(`"${f.label}" depends on something that has no answer`);
    }
  }
  if (!fields.some((f) => !isLayoutField(f.type))) throw new UserFacingError("Add at least one question (headings and text blocks don't count)");
}

const fieldRows = (fields: z.infer<typeof fieldSchema>[]) =>
  fields.map((f, i) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: isLayoutField(f.type) ? false : f.required,
    options: hasOptions(f.type) ? [...new Set(f.options)] : [],
    clientField: isLayoutField(f.type) || f.type === "FILE" ? null : (f.clientField ?? null),
    helpText: f.helpText?.trim() || null,
    placeholder: f.placeholder?.trim() || null,
    showIf: f.showIf ? { key: f.showIf.key, op: f.showIf.op, ...(f.showIf.op !== "filled" && { value: f.showIf.value ?? "" }) } : undefined,
    sortOrder: i,
  }));

const duplicates = {
  duplicateMessages: {
    slug: "That link is already used by another form — pick a different one",
    "organizationId,slug": "That link is already used by another form — pick a different one",
    "templateId,key": "Two questions share the same key",
  },
};

/** Creates (no id) or replaces a form. Past submissions keep their answers and labels (fieldsSnapshot). */
export async function saveFormTemplate(id: string | null, input: FormTemplateInput) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const result = formSchema.safeParse(input);
    if (!result.success) throw new UserFacingError(result.error.issues[0]?.message ?? "Check the form and try again");
    const data = result.data;
    checkFields(data.fields);
    const base = {
      name: data.name,
      slug: data.slug,
      description: data.description?.trim() || null,
      active: data.active,
      thankYouMessage: data.thankYouMessage?.trim() || null,
      sendCopyToSubmitter: data.sendCopyToSubmitter,
      notifyUserIds: data.notifyUserIds,
      notifyEmails: validateNotifyEmails(data.notifyEmails),
      notifyTextUserIds: data.notifyTextUserIds,
    };
    if (data.sendCopyToSubmitter && !data.fields.some((f) => f.type === "EMAIL")) {
      throw new UserFacingError("To email people a copy, add an Email question");
    }
    const saved = await db
      .$transaction(async (tx) => {
        if (!id) return tx.formTemplate.create({ data: { ...base, createdById: session.user.id, fields: { create: fieldRows(data.fields) } } });
        await tx.formField.deleteMany({ where: { templateId: id } });
        return tx.formTemplate.update({ where: { id }, data: { ...base, fields: { create: fieldRows(data.fields) } } });
      })
      .catch((e) => friendlyPrismaError(e, duplicates));
    await recordAudit({ entityType: "FormTemplate", entityId: saved.id, action: id ? "update" : "create", actorId: session.user.id, newValue: saved.name });
    refresh(saved.slug);
    return { id: saved.id, slug: saved.slug };
  });
}

export async function setFormActive(id: string, active: boolean) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const t = await db.formTemplate.update({ where: { id }, data: { active } });
    await recordAudit({ entityType: "FormTemplate", entityId: id, action: active ? "activate" : "deactivate", actorId: session.user.id });
    refresh(t.slug);
  });
}

/** A copy with "-copy" link, inactive until someone turns it on. */
export async function duplicateFormTemplate(id: string) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const t = await db.formTemplate.findUnique({ where: { id }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
    if (!t) throw new UserFacingError("That form is gone");
    let slug = `${t.slug}-copy`;
    for (let n = 2; await db.formTemplate.findFirst({ where: { slug }, select: { id: true } }); n++) slug = `${t.slug}-copy-${n}`;
    const copy = await db.formTemplate.create({
      data: {
        name: `${t.name} (copy)`,
        slug,
        description: t.description,
        active: false,
        thankYouMessage: t.thankYouMessage,
        sendCopyToSubmitter: t.sendCopyToSubmitter,
        notifyUserIds: t.notifyUserIds,
        notifyEmails: t.notifyEmails,
        notifyTextUserIds: t.notifyTextUserIds,
        createdById: session.user.id,
        fields: {
          create: t.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.options,
            clientField: f.clientField,
            helpText: f.helpText,
            placeholder: f.placeholder,
            showIf: f.showIf ?? undefined,
            sortOrder: f.sortOrder,
          })),
        },
      },
    });
    await recordAudit({ entityType: "FormTemplate", entityId: copy.id, action: "duplicate", actorId: session.user.id, oldValue: t.id });
    refresh();
    return { id: copy.id };
  });
}

/** Deletes a form nobody has filled in yet; one with submissions can only be turned off. */
export async function deleteFormTemplate(id: string) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const t = await db.formTemplate.findUnique({ where: { id }, include: { _count: { select: { submissions: true } } } });
    if (!t) throw new UserFacingError("That form is already gone");
    if (t._count.submissions > 0) throw new UserFacingError("This form has submissions, so it can't be deleted — turn it off instead");
    await db.$transaction(async (tx) => {
      await tx.formField.deleteMany({ where: { templateId: id } });
      await tx.formTemplate.delete({ where: { id } });
    });
    await recordAudit({ entityType: "FormTemplate", entityId: id, action: "delete", actorId: session.user.id, oldValue: t.name });
    refresh(t.slug);
  });
}
