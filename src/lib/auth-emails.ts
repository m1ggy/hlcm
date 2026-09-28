import { getEmailBranding, renderEmailLayout, sendEmail } from "@/lib/email";
import { issueAuthToken } from "@/lib/auth-tokens";

// The two emails that carry a set-password link (src/lib/auth-tokens.ts):
// an invite to a new account and a forgot-password reset. Both land on
// /set-password on the organization's own workspace URL.

type Recipient = { id: string; name: string; email: string };

export async function sendInviteEmail(user: Recipient, invitedBy?: string) {
  const token = await issueAuthToken(user.id, "INVITE");
  const { appUrl, brand } = await getEmailBranding();
  const link = `${appUrl}/set-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: `You're invited to ${brand}`,
    html: renderEmailLayout({
      heading: `Welcome to ${brand}`,
      bodyHtml: `<p style="margin:0 0 8px">Hi ${escapeHtml(user.name)},</p><p style="margin:0">${
        invitedBy ? `${escapeHtml(invitedBy)} invited you` : "You've been invited"
      } to ${escapeHtml(brand)}. Choose a password to finish setting up your account — this link works once and expires in 7 days.</p>`,
      ctaLabel: "Set your password",
      ctaUrl: link,
      preheader: `Set your password for ${brand}`,
      appUrl,
      brand,
    }),
  });
}

export async function sendPasswordResetEmail(user: Recipient) {
  const token = await issueAuthToken(user.id, "PASSWORD_RESET");
  const { appUrl, brand } = await getEmailBranding();
  const link = `${appUrl}/set-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
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
    }),
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
