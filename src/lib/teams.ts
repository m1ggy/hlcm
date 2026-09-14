// Thin wrapper around a Microsoft Teams incoming webhook — same shape as
// src/lib/stripe.ts/src/lib/wise.ts (a lazy env getter, a *ConfigError, no
// SDK). One shared webhook URL for the whole org (no per-user delivery —
// Graph API would be needed for that, deliberately not used here; see the
// Reminders plan). Server-only — never import from a client component.
//
// Payload shape: a plain { text } body, matching the classic Office 365
// "Incoming Webhook" connector. Teams has been steering admins toward
// Workflows-based webhooks (built via Power Automate) instead, which are
// configured per-flow and MAY expect a different JSON shape depending on
// how the flow's trigger was built — this is the reasonable default, not a
// guarantee; if Teams rejects it, check what shape the actual configured
// webhook expects and adjust here.

export class TeamsConfigError extends Error {}

export function isTeamsConfigured(): boolean {
  return !!process.env.MS_TEAMS_WEBHOOK_URL;
}

export async function postTeamsMessage(text: string): Promise<void> {
  const url = process.env.MS_TEAMS_WEBHOOK_URL;
  if (!url) throw new TeamsConfigError("MS_TEAMS_WEBHOOK_URL env var is required");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Teams webhook failed: ${res.status} ${await res.text()}`);
  }
}
