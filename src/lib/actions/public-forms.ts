"use server";

import { after } from "next/server";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { db, currentOrg, runAsTenant } from "@/lib/db";
import { getHostOrg } from "@/lib/tenant";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { alertForSubmission, recordSubmission } from "@/lib/form-submit";
import type { Answers } from "@/lib/form-logic";

// The one file in the app allowed to skip requireSession/requireRole — see
// isPublicPath in src/auth.config.ts, which is what actually lets an
// unauthenticated request reach /forms/[slug] and this action at all.
// Every write here is deliberately narrow: it can only ever create a
// FormSubmission (+ its files), never touch a Client or anything else.

// See src/lib/rate-limit.ts — this is the app's main public write surface.
// Generous enough for an office sharing one connection.
const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
/** A person takes longer than this to fill in any form; bots don't. */
const MIN_FILL_MS = 2500;

// Only ever returns an active template — an inactive/unknown slug is
// indistinguishable from "doesn't exist" to the public page, which just
// 404s either way (see src/app/forms/[slug]/page.tsx). Same for a host with
// no organization behind it: slugs are per org, so there's nothing to find.
export async function getPublicFormTemplate(slug: string) {
  const org = await getHostOrg();
  if (!org || org.status !== "ACTIVE") return null;
  return db.formTemplate.findFirst({
    where: { slug, active: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
}

/**
 * The form posts `answers` (JSON: key → text or list), files as
 * `file:<fieldKey>` (several allowed), `startedAt` (ms) and the honeypot.
 * Returns { ok, error } so the message survives production; alerts go out
 * after the response.
 */
export async function submitForm(templateId: string, formData: FormData) {
  return toActionResult(async () => {
    // Honeypot / too fast: look successful, save nothing.
    const startedAt = Number(formData.get("startedAt") ?? 0);
    if (((formData.get("website") as string | null) ?? "").trim() || (startedAt && Date.now() - startedAt < MIN_FILL_MS)) {
      return { thankYouMessage: null as string | null };
    }
    const ip = await getClientIp();
    if (ip && isRateLimited(ip)) throw new UserFacingError("Too many submissions from this connection — please try again in a little while.");

    let answers: Answers;
    try {
      answers = JSON.parse(String(formData.get("answers") ?? "{}"));
    } catch {
      throw new UserFacingError("Something went wrong reading the form — please try again.");
    }
    const files: { key: string; file: File }[] = [];
    for (const [name, value] of formData.entries()) {
      if (name.startsWith("file:") && value instanceof File) files.push({ key: name.slice(5), file: value });
    }

    const { submissionId, thankYouMessage } = await recordSubmission({ templateId, answers, files, ip });
    // Best effort, after the person sees "thanks": a failed alert never fails their submission.
    const org = await currentOrg();
    after(() =>
      runAsTenant(org, () => alertForSubmission(submissionId)).catch((error) => console.error("submitForm: alerts failed:", error))
    );
    return { thankYouMessage };
  });
}
