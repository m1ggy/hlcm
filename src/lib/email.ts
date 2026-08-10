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

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const res = await fetch(`${API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFrom(),
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = body?.message ?? `Resend API returned ${res.status}`;
    throw new EmailApiError(message, res.status, body);
  }
}
