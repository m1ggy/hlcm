// One-off: registers this app's Calendly webhook subscription. Run this
// ONCE per environment, after the app is deployed and reachable at its real
// domain (Calendly needs to be able to reach the callback URL to accept the
// subscription). The signing key this prints doesn't exist until this runs
// — so there's an unavoidable short gap before it's set on the server and
// the app restarted (any delivery in that gap 400s; Calendly retries, so
// nothing sent in that window is actually lost, just delayed) — keep that
// gap small by setting the key immediately after. See the "Calendly
// integration setup" section in README.md for the full runbook this script
// is step 2 of.
//
// CALENDLY_PAT is a Personal Access Token generated from Calendly's
// dashboard (Integrations -> API & Webhooks -> "Generate New Token"). It's
// only needed to run this script — it is NOT the same thing as the signing
// key below, and isn't stored anywhere by the app; consider revoking/
// regenerating it once this has run.
//
// Corrected against a real API call (2026-09-14): Calendly does NOT
// generate and hand back a signing key the way Stripe/DocuSign do — the
// webhook_subscriptions resource has no such field at all, confirmed by
// inspecting a real create response and a real GET. Calendly's model is
// the other way around: WE generate the secret and supply it as
// `signing_key` in the create request, and Calendly signs future
// deliveries with whatever we sent. Calendly never echoes it back (same
// as DocuSign's Connect HMAC key), so this can't be double-checked via the
// API — the real confirmation is a live test delivery actually verifying
// against the key this script generated (see README's runbook step 8: a
// real test booking, and check whether the resulting Lead appears — if
// signature verification were failing, the webhook route would reject it
// with 400 and no Lead would land).
//
// Prints a generated signing key to stdout — copy that into the server's
// CALENDLY_WEBHOOK_SIGNING_KEY env var and restart the app. This script
// never touches the app's own .env, since it has no access to the
// production server's filesystem.
//
// Safe to re-run: deletes any existing subscription(s) on this
// organization/scope first (Calendly doesn't support updating a
// subscription's signing_key in place — delete + recreate is the only way
// to rotate it), then creates a fresh one with a newly generated key.
//
// Usage: CALENDLY_PAT=<token> HCLM_DOMAIN=your-domain.example npx tsx scripts/create-calendly-webhook.ts

import { randomBytes } from "crypto";

const API_BASE = "https://api.calendly.com";

async function main() {
  const pat = process.env.CALENDLY_PAT;
  const domain = process.env.HCLM_DOMAIN;
  if (!pat) throw new Error("CALENDLY_PAT env var is required");
  if (!domain) throw new Error("HCLM_DOMAIN env var is required (e.g. hclm.example.com, no https://)");

  const headers = { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" };

  const meRes = await fetch(`${API_BASE}/users/me`, { headers });
  if (!meRes.ok) throw new Error(`GET /users/me failed: ${meRes.status} ${await meRes.text()}`);
  const me = await meRes.json();
  const organization = me.resource.current_organization as string;
  console.log(`Organization: ${organization}`);

  const listRes = await fetch(
    `${API_BASE}/webhook_subscriptions?organization=${encodeURIComponent(organization)}&scope=organization`,
    { headers }
  );
  if (!listRes.ok) throw new Error(`GET /webhook_subscriptions failed: ${listRes.status} ${await listRes.text()}`);
  const list = await listRes.json();
  for (const existing of list.collection as { uri: string; callback_url: string }[]) {
    console.log(`Deleting existing subscription (${existing.callback_url}): ${existing.uri}`);
    const delRes = await fetch(existing.uri, { method: "DELETE", headers });
    if (!delRes.ok && delRes.status !== 404) throw new Error(`DELETE ${existing.uri} failed: ${delRes.status} ${await delRes.text()}`);
  }

  const signingKey = randomBytes(32).toString("base64");

  const subRes = await fetch(`${API_BASE}/webhook_subscriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: `https://${domain}/api/webhooks/calendly`,
      events: ["invitee.created", "invitee.canceled"],
      organization,
      scope: "organization",
      signing_key: signingKey,
    }),
  });
  if (!subRes.ok) throw new Error(`POST /webhook_subscriptions failed: ${subRes.status} ${await subRes.text()}`);
  const sub = await subRes.json();

  console.log("\nWebhook subscription created:");
  console.log(`  callback_url: ${sub.resource.callback_url}`);
  console.log(`  events: ${sub.resource.events.join(", ")}`);
  console.log(`\nCALENDLY_WEBHOOK_SIGNING_KEY=${signingKey}`);
  console.log("\nPaste that into the server's env (see README.md) and restart the app.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
