import { db, currentOrganization } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import { UserFacingError } from "@/lib/user-facing-error";
import { getEmailBranding, renderEmailLayout, sendEmail } from "@/lib/email";
import { orgAppUrl } from "@/lib/tenant-host";
import { fitSms, textUser } from "@/lib/sms";
import {
  cleanAnswers,
  firstNameFrom,
  formatAnswer,
  isFieldVisible,
  isLayoutField,
  parseShowIf,
  validateAnswers,
  type Answers,
  type FieldSnapshot,
  type FormFieldDef,
  type FormFieldType,
} from "@/lib/form-logic";

// Public form submissions (docs/forms-plan.md): saving one, then telling
// people about it. No session or Next imports — the server action in
// src/lib/actions/public-forms.ts wraps these, and tests call them directly.

export const FORM_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const FORM_FILE_MAX_COUNT = 10;
export const FORM_FILE_LIMIT_LABEL = "25MB";
// What an anonymous sender may upload: photos, PDFs, Word documents.
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".pdf", ".doc", ".docx"]);

type TemplateWithFields = NonNullable<Awaited<ReturnType<typeof loadTemplate>>>;

async function loadTemplate(templateId: string) {
  return db.formTemplate.findFirst({ where: { id: templateId, active: true }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
}

export function fieldDefs(fields: TemplateWithFields["fields"]): FormFieldDef[] {
  return fields.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type as FormFieldType,
    required: f.required,
    options: f.options,
    helpText: f.helpText,
    placeholder: f.placeholder,
    showIf: parseShowIf(f.showIf),
  }));
}

/**
 * Validates and saves a submission (and its files). Throws UserFacingError
 * with the first problem — the form already checks the same rules inline.
 */
export async function recordSubmission(input: { templateId: string; answers: Answers; files: { key: string; file: File }[]; ip: string | null }) {
  const template = await loadTemplate(input.templateId);
  if (!template) throw new UserFacingError("This form isn't available anymore.");
  const defs = fieldDefs(template.fields);

  // Files only count for visible FILE fields.
  const files = input.files.filter((f) => {
    const def = defs.find((d) => d.key === f.key);
    return def?.type === "FILE" && isFieldVisible(def, defs, input.answers) && f.file.size > 0;
  });
  if (files.length > FORM_FILE_MAX_COUNT) throw new UserFacingError(`Attach at most ${FORM_FILE_MAX_COUNT} files`);
  for (const { file } of files) {
    if (file.size > FORM_FILE_MAX_BYTES) throw new UserFacingError(`"${file.name}" is larger than ${FORM_FILE_LIMIT_LABEL}`);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new UserFacingError(`"${file.name}" isn't a supported file — photos, PDFs and Word documents only`);
  }
  const counts: Record<string, number> = {};
  for (const f of files) counts[f.key] = (counts[f.key] ?? 0) + 1;
  const errors = validateAnswers(defs, input.answers, counts);
  const firstError = defs.find((d) => errors[d.key]);
  if (firstError) throw new UserFacingError(`${firstError.label}: ${errors[firstError.key]}`);

  const snapshot: FieldSnapshot[] = template.fields.filter((f) => !isLayoutField(f.type)).map((f) => ({ key: f.key, label: f.label, type: f.type }));
  const submission = await db.formSubmission.create({
    data: { templateId: template.id, answers: cleanAnswers(defs, input.answers), ipAddress: input.ip, fieldsSnapshot: snapshot },
  });
  // Saved (and virus-scanned) after the row exists, so a bad file never
  // orphans half a submission.
  for (const { key, file } of files) {
    const { storageKey, sizeBytes } = await saveUploadedFile(file);
    await db.formSubmissionFile.create({
      data: { submissionId: submission.id, fieldKey: key, fileName: file.name, storageKey, mimeType: file.type || "application/octet-stream", sizeBytes },
    });
  }
  return { submissionId: submission.id, thankYouMessage: template.thankYouMessage };
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Everyone who should hear about a new submission, and how:
 * - bell + email: the form's picked staff and extra emails, or every
 *   owner/admin when none are picked;
 * - text: the form's picked "text" staff who turned on text alerts and have
 *   a phone (decided F1: staff only).
 */
export async function alertForSubmission(submissionId: string) {
  const submission = await db.formSubmission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { template: { include: { fields: { orderBy: { sortOrder: "asc" } } } } },
  });
  const template = submission.template;
  const org = await currentOrganization();
  const answers = (submission.answers ?? {}) as Record<string, unknown>;
  const firstName = firstNameFrom(template.fields, answers);
  const link = `${orgAppUrl(org.slug)}/intake?open=${submission.id}`;
  const message = `New "${template.name}" submission${firstName ? ` from ${firstName}` : ""}`;
  const result = { notified: [] as string[], emailed: [] as string[], texted: [] as string[], copyTo: null as string | null };

  // Bell + email.
  const custom = template.notifyUserIds.length > 0 || Boolean(template.notifyEmails?.trim());
  const users = await db.user.findMany({
    where: custom ? { id: { in: template.notifyUserIds }, active: true } : { role: { in: ["OWNER", "ADMIN"] }, active: true, isSupport: false },
    select: { id: true, email: true, emailNotificationsEnabled: true },
  });
  const extraEmails = (template.notifyEmails ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { appUrl, brand } = await getEmailBranding();
  const staffEmail = (to: string) =>
    sendEmail({
      to,
      subject: `${message} — ${template.name}`,
      html: renderEmailLayout({
        heading: "New form submission",
        bodyHtml: `<p style="margin:0">${escapeHtml(message)}.</p>`,
        preheader: message,
        ctaLabel: "Review it",
        ctaUrl: link,
        appUrl,
        brand,
      }),
    });
  for (const u of users) {
    await db.notification.create({ data: { userId: u.id, type: "FORM_SUBMITTED", message, entityType: "FormSubmission", entityId: submission.id } });
    result.notified.push(u.id);
    if (u.emailNotificationsEnabled) await staffEmail(u.email).then(() => result.emailed.push(u.email), (e) => console.error("form alert email failed:", e));
  }
  for (const to of extraEmails.filter((e) => !users.some((u) => u.email.toLowerCase() === e))) {
    await staffEmail(to).then(() => result.emailed.push(to), (e) => console.error("form alert email failed:", e));
  }

  // Texts (any time of day, decided F4).
  if (template.notifyTextUserIds.length) {
    const texters = await db.user.findMany({
      where: { id: { in: template.notifyTextUserIds }, active: true, smsFormAlerts: true, phone: { not: null } },
      select: { id: true, phone: true, smsOptedOutAt: true },
    });
    const body = fitSms(`Carenela: ${message} at ${org.name}. Review: ${link}`, 320);
    for (const u of texters) {
      const r = await textUser(u, body, { purpose: "FORM_SUBMITTED", entityId: submission.id });
      if (r.ok) result.texted.push(u.id);
    }
  }

  // The person's own copy (decided F6): to the first email they gave.
  if (template.sendCopyToSubmitter) {
    const defs = fieldDefs(template.fields);
    const emailField = defs.find((d) => d.type === "EMAIL" && typeof answers[d.key] === "string");
    const to = emailField ? String(answers[emailField.key]) : null;
    if (to) {
      const rows = defs
        .filter((d) => !isLayoutField(d.type) && d.type !== "FILE" && answers[d.key] !== undefined)
        .map((d) => `<tr><td style="padding:4px 12px 4px 0;color:#5b6577;vertical-align:top">${escapeHtml(d.label)}</td><td style="padding:4px 0">${escapeHtml(formatAnswer(answers[d.key]))}</td></tr>`)
        .join("");
      await sendEmail({
        to,
        subject: `Your ${template.name} — ${brand}`,
        html: renderEmailLayout({
          heading: "We got your form",
          bodyHtml: `<p style="margin:0 0 12px">Thanks — here's a copy of what you sent ${escapeHtml(brand)}.</p><table role="presentation" style="font-size:14px;border-collapse:collapse">${rows}</table>`,
          preheader: `A copy of your ${template.name}`,
          appUrl,
          brand,
          footerHtml: `<p style="margin:0">You're getting this because you filled in a form from ${escapeHtml(brand)}.</p>`,
        }),
      }).then(
        async () => {
          await db.formSubmission.update({ where: { id: submission.id }, data: { copyEmailedTo: to } });
          result.copyTo = to;
        },
        (e) => console.error("form copy email failed:", e)
      );
    }
  }
  return result;
}
