import { getEmailBranding, renderEmailLayout, sendEmail } from "@/lib/email";
import { issueAuthToken } from "@/lib/auth-tokens";
import { UserFacingError } from "@/lib/user-facing-error";

// The two emails that carry a set-password link (src/lib/auth-tokens.ts):
// an invite to a new account and a forgot-password reset. Both land on
// /set-password on the organization's own workspace URL.

// email is null for someone who signs in with their phone number
// (docs/client-care-plan.md) — there's nowhere to send a link to them.
type Recipient = { id: string; name: string; email: string | null };

function emailOf(user: Recipient): string {
  if (!user.email) throw new UserFacingError(`${user.name} has no email address — they sign in with their phone number`);
  return user.email;
}

// Says what they're joining as, so a staff invite and an owner invite don't
// read the same.
const INVITE_ROLE: Record<string, string> = {
  OWNER: "an owner",
  ADMIN: "an admin",
  ACCOUNTANT: "an accountant",
  MANAGER: "a manager",
  STAFF: "a member of staff",
  CAREGIVER: "a caregiver",
  CLIENT: "a client",
};

export async function sendInviteEmail(user: Recipient & { role: string }, invitedBy?: string) {
  const to = emailOf(user);
  const token = await issueAuthToken(user.id, "INVITE");
  const { appUrl, brand } = await getEmailBranding();
  const link = `${appUrl}/set-password?token=${encodeURIComponent(token)}`;
  const as = INVITE_ROLE[user.role];
  await sendEmail({
    to,
    subject: user.role === "OWNER" ? `You're invited to run ${brand}` : `You're invited to ${brand}`,
    html: renderEmailLayout({
      heading: `Welcome to ${brand}`,
      bodyHtml: `<p style="margin:0 0 8px">Hi ${escapeHtml(user.name)},</p><p style="margin:0">${
        invitedBy ? `${escapeHtml(invitedBy)} invited you` : "You've been invited"
      } to ${escapeHtml(brand)}${as ? ` as ${as}` : ""}. Choose a password to finish setting up your account — this link works once and expires in 7 days.</p>`,
      ctaLabel: "Set your password",
      ctaUrl: link,
      preheader: `Set your password for ${brand}`,
      appUrl,
      brand,
      footerHtml: `You're getting this because you were invited to ${escapeHtml(brand)}. If you weren't expecting it, you can ignore this email.`,
    }),
  });
}

export async function sendPasswordResetEmail(user: Recipient) {
  const to = emailOf(user);
  const token = await issueAuthToken(user.id, "PASSWORD_RESET");
  const { appUrl, brand } = await getEmailBranding();
  const link = `${appUrl}/set-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: `Reset your ${brand} password`,
    html: renderEmailLayout({
      heading: "Reset your password",
      bodyHtml: `<p style="margin:0 0 8px">Hi ${escapeHtml(user.name)},</p><p style="margin:0">Someone asked to reset the password for your ${escapeHtml(
        brand
      )} account. If that was you, choose a new one below — the link works once and expires in 1 hour. If it wasn't, you can ignore this email; your password hasn't changed.</p>`,
      ctaLabel: "Choose a new password",
      ctaUrl: link,
      preheader: "Reset your password",
      appUrl,
      brand,
      footerHtml: "You're getting this because someone asked to reset your password. If it wasn't you, you can ignore this email.",
    }),
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
