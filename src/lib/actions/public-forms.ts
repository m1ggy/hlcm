"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderEmailLayout, getAppUrl } from "@/lib/email";
import { saveUploadedFile } from "@/lib/storage";

// The one file in the app allowed to skip requireSession/requireRole — see
// isPublicPath in src/auth.config.ts, which is what actually lets an
// unauthenticated request reach /forms/[slug] and this action at all.
// Every write here is deliberately narrow: it can only ever create a
// FormSubmission (+ its files), never touch a Client or anything else.

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB, same cap the rest of the app uses
// Narrower than invoice-attachments.ts's allowlist on purpose — no Office
// docs from an anonymous sender, just what an intake form plausibly needs
// (a photo of an ID, a signed page).
const ALLOWED_FILE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const ALLOWED_FILE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".pdf"]);

// Module-level, in-memory, per-IP — resets on deploy/restart and doesn't
// share across instances if this app is ever scaled horizontally. That's
// fine for this app's current single-instance deploy; it's flagged here as
// the first thing to swap for a real store (Redis/Upstash) if abuse of
// this, the app's only public write surface, turns out to be a real problem.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissionsByIp = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    submissionsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  submissionsByIp.set(ip, recent);
  return false;
}

async function getClientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

// Only ever returns an active template — an inactive/unknown slug is
// indistinguishable from "doesn't exist" to the public page, which just
// 404s either way (see src/app/forms/[slug]/page.tsx).
export async function getPublicFormTemplate(slug: string) {
  return prisma.formTemplate.findFirst({
    where: { slug, active: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function submitForm(templateId: string, formData: FormData) {
  // Honeypot: a field real users never see (hidden off-screen in the form,
  // not just visually — see the client component). A bot filling every
  // input trips it; silently no-op rather than error, so it doesn't learn
  // anything from the response.
  if (((formData.get("website") as string | null) ?? "").trim()) {
    return { ok: true };
  }

  const ip = await getClientIp();
  if (ip && isRateLimited(ip)) {
    throw new Error("Too many submissions from this connection — please try again later.");
  }

  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, active: true },
    include: { fields: true },
  });
  if (!template) throw new Error("This form isn't available anymore.");

  const answers: Record<string, string> = {};
  const fileUploads: { fieldKey: string; file: File }[] = [];

  for (const field of template.fields) {
    if (field.type === "FILE") {
      const value = formData.get(field.key);
      if (value instanceof File && value.size > 0) {
        fileUploads.push({ fieldKey: field.key, file: value });
      } else if (field.required) {
        throw new Error(`"${field.label}" is required.`);
      }
      continue;
    }

    if (field.type === "CHECKBOX") {
      const checked = formData.get(field.key) === "on";
      if (field.required && !checked) throw new Error(`"${field.label}" must be checked.`);
      if (checked) answers[field.key] = "yes";
      continue;
    }

    const raw = (formData.get(field.key) as string | null) ?? "";
    const value = raw.trim();
    if (field.required && !value) throw new Error(`"${field.label}" is required.`);
    if (field.type === "SELECT" && value && !field.options.includes(value)) {
      throw new Error(`"${field.label}" has an invalid value.`);
    }
    if (value) answers[field.key] = value;
  }

  for (const { file } of fileUploads) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is too large — files are limited to 20MB.`);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.has(ext) && !ALLOWED_FILE_MIME_TYPES.has(file.type)) {
      throw new Error(`"${file.name}" isn't a supported file type — only images and PDFs are allowed.`);
    }
  }

  const submission = await prisma.formSubmission.create({
    data: { templateId: template.id, answers, ipAddress: ip },
  });

  // Uploaded (and virus-scanned via saveUploadedFile) after the row exists
  // so a failed upload doesn't orphan a half-created submission — the
  // submission itself is always valid even if a file attached to it isn't.
  for (const { fieldKey, file } of fileUploads) {
    const { storageKey, sizeBytes } = await saveUploadedFile(file);
    await prisma.formSubmissionFile.create({
      data: {
        submissionId: submission.id,
        fieldKey,
        fileName: file.name,
        storageKey,
        mimeType: file.type || "application/octet-stream",
        sizeBytes,
      },
    });
  }

  // Best-effort — a notification failure must never make the submission
  // itself look like it failed to whoever just filled the form out.
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { email: true },
    });
    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `New form submission — ${template.name}`,
        html: renderEmailLayout({
          heading: "New form submission",
          bodyHtml: `<p style="margin:0">Someone just filled out &quot;${template.name}&quot;.</p>`,
          preheader: `New submission for ${template.name}`,
          ctaLabel: "Review it",
          ctaUrl: `${getAppUrl()}/admin/forms/inbox`,
        }),
      });
    }
  } catch (error) {
    console.error("submitForm: failed to notify admins:", error);
  }

  return { ok: true };
}
