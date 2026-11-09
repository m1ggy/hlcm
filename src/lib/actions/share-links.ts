"use server";

import { revalidatePath } from "next/cache";
import { db, currentOrganization } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { getEmailBranding, renderEmailLayout, sendEmail } from "@/lib/email";
import { orgAppUrl } from "@/lib/tenant-host";
import { dayRangeToInstants, DEFAULT_TIMEZONE } from "@/lib/time-entries";
import * as share from "@/lib/share-links";

// Share links (docs/client-portal-eod-plan.md, Phase D): the Share dialog on
// an application. The link is shown once, when it's made — and can be
// emailed to the client's contacts right then.

async function actor(): Promise<share.ShareActor> {
  const session = await requireSession();
  return { userId: session.user.id, role: session.user.role };
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "YYYY-MM-DD" → the end of that day in the workspace's timezone (the link works through it). */
async function endOfDay(day: string | null) {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new UserFacingError("That date isn't valid");
  const org = await currentOrganization();
  return dayRangeToInstants(day, day, org.timezone || DEFAULT_TIMEZONE).to;
}

/** Who the link can be emailed to: the client's contacts and business email. */
async function recipientsFor(applicationId: string) {
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { client: { select: { name: true, businessEmail: true, contacts: { select: { name: true, email: true }, orderBy: { name: "asc" } } } } },
  });
  const list = app.client.contacts.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email!.trim().toLowerCase() }));
  const business = app.client.businessEmail?.trim().toLowerCase();
  if (business && !list.some((c) => c.email === business)) list.push({ name: app.client.name, email: business });
  return list;
}

export async function getShareStateAction(applicationId: string) {
  return toActionResult(async () => {
    const me = await actor();
    const link = await share.getActiveShareLink(me, applicationId);
    return { link, recipients: await recipientsFor(applicationId) };
  });
}

export async function createShareLinkAction(applicationId: string, input: { expiresOn: string | null; emailTo: string[] }) {
  return toActionResult(async () => {
    const me = await actor();
    const allowed = await recipientsFor(applicationId);
    const emailTo = [...new Set(input.emailTo.map((e) => e.trim().toLowerCase()))];
    if (emailTo.some((e) => !allowed.some((r) => r.email === e))) throw new UserFacingError("Links can only be emailed to the client's contacts");

    const { token, link } = await share.createShareLink(me, applicationId, { expiresAt: await endOfDay(input.expiresOn) });
    const org = await currentOrganization();
    const url = `${orgAppUrl(org.slug)}/share/a/${token}`;

    let emailed = 0;
    if (emailTo.length) {
      const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, select: { name: true, client: { select: { name: true } } } });
      const { appUrl, brand } = await getEmailBranding();
      await sendEmail({
        to: emailTo,
        subject: `Progress on ${app.name}`,
        html: renderEmailLayout({
          heading: "Your application's progress",
          bodyHtml: `<p style="margin:0 0 8px">${escapeHtml(brand)} shared a page where you can follow the progress of <strong>${escapeHtml(app.name)}</strong> for ${escapeHtml(app.client.name)}: where it stands, what's been done each day, and the checklist.</p><p style="margin:0">No account or password needed — keep this email, the link is just for you.</p>`,
          ctaLabel: "View progress",
          ctaUrl: url,
          preheader: `Follow the progress of ${app.name}`,
          appUrl,
          brand,
          footerHtml: `<p style="margin:0">Sent by ${escapeHtml(brand)}. If you weren't expecting this, you can ignore it.</p>`,
        }),
      });
      emailed = emailTo.length;
    }
    revalidatePath(`/applications/${applicationId}`);
    return { url, link, emailed };
  });
}

export async function setShareExpiryAction(applicationId: string, expiresOn: string | null) {
  return toActionResult(async () => {
    await share.setShareLinkExpiry(await actor(), applicationId, await endOfDay(expiresOn));
    return share.getActiveShareLink(await actor(), applicationId);
  });
}

export async function revokeShareLinkAction(applicationId: string) {
  return toActionResult(async () => {
    await share.revokeShareLink(await actor(), applicationId);
    revalidatePath(`/applications/${applicationId}`);
  });
}
