// One-off: registers this app's DocuSign Connect (webhook) subscription.
// Run this ONCE per environment, LAST — after the app is deployed,
// reachable at its real domain, AND already has DOCUSIGN_INTEGRATION_KEY/
// DOCUSIGN_USER_ID/DOCUSIGN_ACCOUNT_ID/DOCUSIGN_PRIVATE_KEY set (this
// script authenticates as the app itself, via src/lib/docusign.ts's own
// getAccessToken()/getAccountBaseUri() — it does not take a separate token
// of its own, unlike create-calendly-webhook.ts, since by this point the
// app's own DocuSign auth is already configured). See the "DocuSign
// integration setup" section in README.md for the full runbook this
// script is step 6 of.
//
// Prints the subscription's HMAC key to stdout — copy that into the
// server's DOCUSIGN_WEBHOOK_HMAC_KEY env var and restart the app. This
// script never touches the app's own .env, since it has no access to the
// production server's filesystem.
//
// Whether DocuSign Connect returns the HMAC key on creation, or expects
// one supplied in the request instead, can vary by account type — this
// generates one and sends it, then prints whatever comes back, so check
// the printed value against what you actually configured if anything
// looks off.
//
// Usage: HCLM_DOMAIN=your-domain.example npx tsx scripts/create-docusign-connect.ts

import { randomBytes } from "crypto";
import { getAccessToken, getAccountBaseUri } from "../src/lib/docusign";

async function main() {
  const domain = process.env.HCLM_DOMAIN;
  if (!domain) throw new Error("HCLM_DOMAIN env var is required (e.g. hclm.example.com, no https://)");

  const accessToken = await getAccessToken();
  const { accountId, baseUri } = await getAccountBaseUri();
  console.log(`Account: ${accountId} (${baseUri})`);

  const hmacKey = randomBytes(32).toString("base64");

  const res = await fetch(`${baseUri}/restapi/v2.1/accounts/${accountId}/connect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      configurationType: "custom",
      urlToPublishTo: `https://${domain}/api/webhooks/docusign`,
      enableLog: "true",
      includeHMAC: "true",
      hmacKeys: [hmacKey],
      envelopeEvents: [
        { envelopeEventStatusCode: "sent" },
        { envelopeEventStatusCode: "delivered" },
        { envelopeEventStatusCode: "completed" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
      ],
    }),
  });
  if (!res.ok) throw new Error(`POST /connect failed: ${res.status} ${await res.text()}`);
  const connect = await res.json();

  console.log("\nConnect subscription created:");
  console.log(`  connectId: ${connect.connectId}`);
  console.log(`  urlToPublishTo: https://${domain}/api/webhooks/docusign`);
  console.log(`\nDOCUSIGN_WEBHOOK_HMAC_KEY=${hmacKey}`);
  console.log("\nPaste that into the server's env (see README.md) and restart the app.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
