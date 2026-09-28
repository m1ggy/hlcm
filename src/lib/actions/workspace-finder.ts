"use server";

import { findWorkspacesForEmail } from "@/lib/platform";
import { orgAppUrl } from "@/lib/tenant-host";
import { PRODUCT_NAME } from "@/lib/branding";
import { renderEmailLayout, sendEmail } from "@/lib/email";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

// "Find your workspace" on the bare root domain: emails the address a link
// to every workspace it can sign in to. The page always shows the same
// answer, so it can't be used to learn who has accounts where.

const isRateLimited = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
const SENT = "If that email has an account, we've sent it a link to each workspace it can sign in to.";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function requestWorkspaceLinks(
  _prev: { message?: string; error?: string } | undefined,
  formData: FormData
): Promise<{ message?: string; error?: string }> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const ip = await getClientIp();
  if (isRateLimited(`finder:${ip ?? "unknown"}`) || isRateLimited(`finder:${email}`)) {
    return { error: "Too many requests — please try again later." };
  }

  const workspaces = await findWorkspacesForEmail(email);
  if (workspaces.length > 0) {
    const root = process.env.ROOT_DOMAIN ? `https://${process.env.ROOT_DOMAIN}` : orgAppUrl(workspaces[0].slug);
    const list = workspaces
      .map((w) => {
        const url = `${orgAppUrl(w.slug)}/login`;
        return `<li style="margin:0 0 6px"><a href="${url}" style="color:#1d4ed8">${escapeHtml(w.name)}</a> <span style="color:#6b7280">— ${url.replace(/^https?:\/\//, "")}</span></li>`;
      })
      .join("");
    try {
      await sendEmail({
        to: email,
        subject: `Your ${PRODUCT_NAME} workspaces`,
        html: renderEmailLayout({
          heading: "Your workspaces",
          bodyHtml: `<p style="margin:0 0 12px">You can sign in to:</p><ul style="margin:0;padding-left:18px">${list}</ul>`,
          preheader: `Sign-in links for your ${PRODUCT_NAME} workspaces`,
          appUrl: root,
          brand: PRODUCT_NAME,
        }),
      });
    } catch (error) {
      console.error("Failed to send workspace-finder email:", error);
    }
  }
  return { message: SENT };
}
