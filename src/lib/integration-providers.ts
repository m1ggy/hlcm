// What each third-party integration needs from an organization — the one
// description shared by the admin form (Admin > Integrations), the save
// validation, and the env-var fallback for the org that predates per-org
// integrations (src/lib/integrations.ts). Pure data: safe in client bundles.

export type IntegrationProviderId = "STRIPE" | "DOCUSIGN" | "CALENDLY" | "WISE" | "TWILIO" | "TEAMS";

export type IntegrationField = {
  key: string;
  label: string;
  /** Stored encrypted and never sent back to the browser. */
  secret: boolean;
  required: boolean;
  kind?: "text" | "textarea" | "boolean";
  help?: string;
  placeholder?: string;
  /** Used when the field is left blank. */
  defaultValue?: string;
  /** The env var this came from before per-org integrations (legacy fallback). */
  env?: string;
};

export type IntegrationProviderSpec = {
  id: IntegrationProviderId;
  label: string;
  description: string;
  fields: IntegrationField[];
  /** Webhook path to register with the provider, under the org's own workspace URL. */
  webhookPath?: string;
};

export const INTEGRATION_PROVIDERS: IntegrationProviderSpec[] = [
  {
    id: "STRIPE",
    label: "Stripe",
    description: "Invoices sent and paid through Stripe.",
    webhookPath: "/api/webhooks/stripe",
    fields: [
      { key: "secretKey", label: "Secret key", secret: true, required: true, placeholder: "sk_live_…", env: "STRIPE_SECRET_KEY" },
      { key: "webhookSecret", label: "Webhook signing secret", secret: true, required: false, placeholder: "whsec_…", env: "STRIPE_WEBHOOK_SECRET", help: "From the webhook endpoint you add in Stripe for the webhook URL above." },
      { key: "taxEnabled", label: "Stripe Tax enabled", secret: false, required: false, kind: "boolean", defaultValue: "false", env: "STRIPE_TAX_ENABLED" },
    ],
  },
  {
    id: "DOCUSIGN",
    label: "DocuSign",
    description: "Sending documents for signature.",
    webhookPath: "/api/webhooks/docusign",
    fields: [
      { key: "integrationKey", label: "Integration key", secret: false, required: true, env: "DOCUSIGN_INTEGRATION_KEY" },
      { key: "userId", label: "API username (user GUID)", secret: false, required: true, env: "DOCUSIGN_USER_ID" },
      { key: "accountId", label: "Account ID", secret: false, required: true, env: "DOCUSIGN_ACCOUNT_ID" },
      { key: "authServer", label: "Auth server", secret: false, required: false, defaultValue: "account-d.docusign.com", env: "DOCUSIGN_AUTH_SERVER", help: "account-d.docusign.com (sandbox) or account.docusign.com (production)." },
      { key: "privateKey", label: "RSA private key (base64 of the PEM)", secret: true, required: true, kind: "textarea", env: "DOCUSIGN_PRIVATE_KEY" },
      { key: "webhookHmacKey", label: "Connect HMAC key", secret: true, required: false, env: "DOCUSIGN_WEBHOOK_HMAC_KEY" },
    ],
  },
  {
    id: "CALENDLY",
    label: "Calendly",
    description: "Bookings arrive as Leads; rebooking links and cancellations.",
    webhookPath: "/api/webhooks/calendly",
    fields: [
      { key: "bookingUrl", label: "Public booking page", secret: false, required: false, placeholder: "https://calendly.com/your-team", env: "CALENDLY_BOOKING_URL", help: "Fallback link in follow-up emails when a single-use link can't be made." },
      { key: "apiToken", label: "Personal access token", secret: true, required: false, env: "CALENDLY_API_TOKEN" },
      { key: "webhookSigningKey", label: "Webhook signing key", secret: true, required: false, env: "CALENDLY_WEBHOOK_SIGNING_KEY" },
    ],
  },
  {
    id: "WISE",
    label: "Wise",
    description: "Payouts to staff.",
    fields: [
      { key: "apiToken", label: "API token", secret: true, required: true, env: "WISE_API_TOKEN" },
      { key: "profileId", label: "Profile ID", secret: false, required: true, env: "WISE_PROFILE_ID" },
      { key: "apiBase", label: "API base URL", secret: false, required: false, defaultValue: "https://api.sandbox.transferwise.tech", env: "WISE_API_BASE", help: "Sandbox by default; https://api.transferwise.com for live payouts." },
      { key: "sourceCurrency", label: "Pay out from (currency)", secret: false, required: false, defaultValue: "USD", placeholder: "USD", env: "WISE_SOURCE_CURRENCY" },
    ],
  },
  {
    id: "TWILIO",
    label: "Twilio",
    description: "Text/call reminders before meetings.",
    fields: [
      { key: "accountSid", label: "Account SID", secret: false, required: true, env: "TWILIO_ACCOUNT_SID" },
      { key: "authToken", label: "Auth token", secret: true, required: true, env: "TWILIO_AUTH_TOKEN" },
      { key: "fromNumber", label: "From number", secret: false, required: true, placeholder: "+15551234567", env: "TWILIO_FROM_NUMBER" },
    ],
  },
  {
    id: "TEAMS",
    label: "Microsoft Teams",
    description: "Meeting-reminder posts to a Teams channel.",
    fields: [{ key: "webhookUrl", label: "Incoming webhook URL", secret: true, required: true, env: "MS_TEAMS_WEBHOOK_URL" }],
  },
];

export function providerSpec(id: IntegrationProviderId): IntegrationProviderSpec {
  const spec = INTEGRATION_PROVIDERS.find((p) => p.id === id);
  if (!spec) throw new Error(`Unknown integration provider ${id}`);
  return spec;
}
