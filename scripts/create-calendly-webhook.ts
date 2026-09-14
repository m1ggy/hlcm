// One-off: registers this app's Calendly webhook subscription. Run this
// ONCE per environment, after the app is deployed and reachable at its real
// domain (Calendly needs to be able to reach the callback URL to accept the
// subscription). The signing_key this prints doesn't exist until this runs
// — so there's an unavoidable short gap before it's set on the server and
// the app restarted (any delivery in that gap 500s; Calendly retries, so
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
// Prints the subscription's signing_key to stdout — copy that into the
// server's CALENDLY_WEBHOOK_SIGNING_KEY env var and restart the app. This
// script never touches the app's own .env, since it has no access to the
// production server's filesystem.
//
// Usage: CALENDLY_PAT=<token> HCLM_DOMAIN=your-domain.example npx tsx scripts/create-calendly-webhook.ts

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

  const subRes = await fetch(`${API_BASE}/webhook_subscriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: `https://${domain}/api/webhooks/calendly`,
      events: ["invitee.created", "invitee.canceled"],
      organization,
      scope: "organization",
    }),
  });
  if (!subRes.ok) throw new Error(`POST /webhook_subscriptions failed: ${subRes.status} ${await subRes.text()}`);
  const sub = await subRes.json();

  console.log("\nWebhook subscription created:");
  console.log(`  callback_url: ${sub.resource.callback_url}`);
  console.log(`  events: ${sub.resource.events.join(", ")}`);
  console.log(`\nCALENDLY_WEBHOOK_SIGNING_KEY=${sub.resource.signing_key}`);
  console.log("\nPaste that into the server's env (see README.md) and restart the app.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
