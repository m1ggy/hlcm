// Thin wrapper around Resend's HTTP API. Server-only — never import this
// from a client component, the API key would end up in the bundle.
//
// Docs: https://resend.com/docs/api-reference/emails/send-email

const API_BASE = "https://api.resend.com";

export class EmailConfigError extends Error {}
export class EmailApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

function getApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmailConfigError("RESEND_API_KEY env var is required");
  return key;
}

function getFrom() {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new EmailConfigError("EMAIL_FROM env var is required");
  return from;
}

/** Base URL for building absolute links in email bodies — reuses the same
 * domain Caddy is already configured with in production. */
export function getAppUrl() {
  const domain = process.env.HCLM_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}

// Shared visual wrapper for every transactional email this app sends
// (notify()'s per-event emails, the due-date digest). Plain inline styles
// and a single-column table — email clients strip <style> blocks and don't
// reliably support flexbox/grid, so nothing here relies on either.
const BRAND = "CTK";
const ACCENT = "#1d4ed8";

export function renderEmailLayout(opts: {
  /** Short label above the message — "Task assigned", "You were mentioned", etc. */
  heading: string;
  /** Main body — one or more <p>/<ul> blocks; already-escaped HTML. */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Hidden preview text shown next to the subject in most inboxes. */
  preheader?: string;
}): string {
  const { heading, bodyHtml, ctaLabel, ctaUrl, preheader } = opts;
  const button =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px">
           <tr><td style="border-radius:6px;background:${ACCENT}">
             <a href="${ctaUrl}" style="display:inline-block;padding:10px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${ctaLabel}</a>
           </td></tr>
         </table>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</span>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;overflow:hidden">
            <tr>
              <td style="padding:20px 28px;border-bottom:1px solid #e5e7eb">
                <span style="font-size:15px;font-weight:700;letter-spacing:0.02em;color:#111827">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <p style="margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${ACCENT}">${heading}</p>
                <div style="font-size:14px;line-height:1.6;color:#1f2937">${bodyHtml}</div>
                ${button}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e5e7eb">
                <p style="margin:0;font-size:12px;color:#9ca3af">
                  You're getting this because you have email notifications on for ${BRAND}'s case management system.
                  <a href="${getAppUrl()}/account" style="color:#9ca3af">Manage notification settings</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendEmail(params: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  /** e.g. an invoice PDF — `content` is raw bytes, base64-encoded here, not by the caller. */
  attachments?: { filename: string; content: Uint8Array }[];
}) {
  const res = await fetch(`${API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFrom(),
      to: params.to,
      cc: params.cc?.length ? params.cc : undefined,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
      })),
    }),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.message ?? `Resend API returned ${res.status}`;
    throw new EmailApiError(message, res.status, body);
  }
}
