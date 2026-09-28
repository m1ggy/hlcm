# HCLM

Internal CRM for VAs managing healthcare facility licensing applications (CILA, IDPH, IDOA).

## Local development

Requires a local Postgres instance (see `.env` for `DATABASE_URL`) — Docker isn't used for local dev.

```bash
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

Bootstrap admin: `admin@hclm.local` / `ChangeMe123!` (override via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).

Tests: `npm test` runs the suite against a real Postgres database (`hclm_test`, created next to your dev database and rebuilt from `prisma/migrations` on every run; override with `TEST_DATABASE_URL` — its name must end in `_test`).

### Multitenancy

Every row belongs to an organization (tenant), picked by the request's host — see `docs/multitenancy-plan.md`. App code reads and writes through `db` from `src/lib/db.ts`, never the raw Prisma client (ESLint enforces this).

- **Single-tenant mode** (default — `ROOT_DOMAIN` unset): every host maps to the org in `DEFAULT_ORG_SLUG` (default `ctk`), so `http://localhost:3000` works as before.
- **Multi-tenant mode**: set `ROOT_DOMAIN` (e.g. `ROOT_DOMAIN=localhost` locally) and use `http://<slug>.localhost:3000` — browsers resolve `*.localhost` on their own. The bare root domain and unknown subdomains have no tenant.
- Don't set `AUTH_URL`/`NEXTAUTH_URL`: it pins every sign-in redirect to one host.
- Scripts and seeds run as one org: `ORG_SLUG=<slug> npx tsx scripts/…` (default `ctk`).
- A new organization's starting setup (license types, case types, checklists, service types, lists) is copied from the template org — `TEMPLATE_ORG_SLUG`, default `ctk` (see `seedOrganization` in `src/lib/org-seed.ts`).
- Third-party integrations (Stripe, DocuSign, Calendly, Wise, Twilio, Teams) are per organization: each workspace connects its own accounts under **Admin → Integrations** (owners only). Secrets are stored encrypted with `INTEGRATION_ENCRYPTION_KEY` (32 random bytes, base64 — `openssl rand -base64 32`; required to save any integration, and losing it means re-entering every org's secrets). Until an org saves an integration there, the legacy org (`LEGACY_INTEGRATIONS_ORG_SLUG`, default `ctk`) keeps using the `STRIPE_*` / `DOCUSIGN_*` / `CALENDLY_*` / `WISE_*` / `TWILIO_*` / `MS_TEAMS_WEBHOOK_URL` env vars documented below; once saved, those env vars can be removed. Each org registers webhooks at its own workspace URL (shown on the Integrations page).

## Deploying

Every push to `main` builds a Docker image, pushes it to GHCR, and deploys it to a DigitalOcean droplet over SSH (`.github/workflows/deploy.yml`). The droplet runs the stack from `docker-compose.yml` (app + Postgres + Caddy).

### One-time droplet setup

1. Droplet has Docker + the Compose plugin installed, and a non-root user with SSH key access.
2. Create the deploy directory (default `/opt/hclm-app`, override with the `DROPLET_DEPLOY_PATH` secret) and add a `.env.production` file there with the app's runtime secrets:
   ```
   DATABASE_URL=postgresql://hclm:<password>@postgres:5432/hclm?schema=public
   POSTGRES_USER=hclm
   POSTGRES_PASSWORD=<password>
   POSTGRES_DB=hclm
   AUTH_SECRET=<generate with `openssl rand -base64 32`>
   HCLM_DOMAIN=your-domain.example
   RESEND_API_KEY=<from resend.com — powers status-change/task/digest emails>
   EMAIL_FROM=HCLM <notifications@your-domain.example>
   GOOGLE_MAPS_API_KEY=<from a Google Cloud project with the Geocoding API enabled>
   CALENDLY_WEBHOOK_SIGNING_KEY=<from the webhook subscription's create response — see "Calendly integration setup" below>
   CALENDLY_API_TOKEN=<a Personal Access Token — Calendly dashboard → Integrations → API & Webhooks → Generate New Token — see "Calendly integration setup" below>
   MS_TEAMS_WEBHOOK_URL=<an Incoming Webhook URL for a Teams channel/chat — powers the meeting-reminder Teams post>
   TWILIO_ACCOUNT_SID=<from twilio.com>
   TWILIO_AUTH_TOKEN=<from twilio.com>
   TWILIO_FROM_NUMBER=<the Twilio phone number reminders are sent/called from, e.g. +15551234567>
   DOCUSIGN_INTEGRATION_KEY=<from DocuSign Admin — see "DocuSign integration setup" below>
   DOCUSIGN_USER_ID=<the sending user's API Username, a GUID — not their login email>
   DOCUSIGN_ACCOUNT_ID=<from DocuSign Admin>
   DOCUSIGN_PRIVATE_KEY=<base64 of the RSA private key PEM DocuSign generates>
   DOCUSIGN_AUTH_SERVER=account-d.docusign.com
   DOCUSIGN_WEBHOOK_HMAC_KEY=<from the Connect subscription's create response>
   ```
   `RESEND_API_KEY`/`EMAIL_FROM` are optional — without them the app still works, it just logs a warning and skips email (in-app notifications still work). `HCLM_DOMAIN` (already required above for Caddy) doubles as the base URL for links inside notification emails. `GOOGLE_MAPS_API_KEY` is also optional — without it, Care Recipient addresses still save fine, they just don't get geocoded, so a Caregiver's clock-in skips the "near/far from the recipient's house" check (see src/lib/geocoding.ts). `CALENDLY_WEBHOOK_SIGNING_KEY` is optional too, but unlike the others there's no partial-degrade mode: without it, `/api/webhooks/calendly` 500s on every delivery attempt rather than silently skipping, since a webhook receiver that can't verify signatures must not accept payloads at all. `MS_TEAMS_WEBHOOK_URL`/`TWILIO_*` are optional and genuinely silent when unset — the meeting-reminder poll (src/lib/meeting-reminders.ts) just skips that one channel every run, no warning logged, since it's expected/normal until set up (see "Meeting reminders setup" below). The in-app + email reminder to whoever's assigned to a Lead still works regardless of either. `DOCUSIGN_*` are all required together for any signature-sending to work at all (there's no partial-degrade for the send flow itself — see "DocuSign integration setup" below); `DOCUSIGN_WEBHOOK_HMAC_KEY` specifically has the same hard-fail-if-unset rule as `CALENDLY_WEBHOOK_SIGNING_KEY`, for the same reason.
   This file is never touched by CI/CD — it's the one thing that lives only on the server.
3. Open ports 80/443 (and the SSH port) in the droplet's firewall.

### Required GitHub secrets

| Secret | Purpose |
|---|---|
| `DROPLET_HOST` | Droplet IP or hostname |
| `DROPLET_USER` | SSH user |
| `DROPLET_SSH_KEY` | Private key for that user (public half in the droplet's `authorized_keys`) |
| `DROPLET_SSH_PORT` | Optional, defaults to 22 |
| `DROPLET_DEPLOY_PATH` | Optional, defaults to `/opt/hclm-app` |

`GITHUB_TOKEN` (auto-provided) handles the GHCR push and the droplet's pull — no separate registry credential needed.

### What a deploy does

1. Builds the `runner` (app) and `migrator` (one-off `prisma migrate deploy`) targets from `Dockerfile`, pushes both to `ghcr.io/<owner>/<repo>`.
2. Copies `docker-compose.yml` + `Caddyfile` to the droplet.
3. Pulls both images, runs the migrator once, then brings up `app`/`caddy`/`postgres` via Compose.

Uploaded files (the per-application file pool) persist in the `hclm_uploads` named volume across deploys.

## Switching production to multi-tenant (subdomains)

Everything below is off until `ROOT_DOMAIN` is set — until then the app runs single-tenant on `HCLM_DOMAIN` exactly as before.

1. **DNS:** point `<ROOT_DOMAIN>` and `*.<ROOT_DOMAIN>` (A/AAAA) at the droplet. Keep the existing `HCLM_DOMAIN` record.
2. **`.env.production`:** add `ROOT_DOMAIN=<root domain>` (and `INTEGRATION_ENCRYPTION_KEY` if not already set). Keep `HCLM_DOMAIN` — it keeps serving CTK (`LEGACY_DOMAIN_ORG_SLUG`, default `ctk`), so old bookmarks and already-registered webhook URLs keep working. Restart the stack.
3. **Certificates:** nothing to do — Caddy issues one per workspace on its first visit, after `/api/tls-check` confirms the name is a real workspace, `admin.<ROOT_DOMAIN>`, or the root domain (see `Caddyfile`).
4. **Platform admin:** `docker compose --profile tools run --rm migrate sh -c 'ORG_SLUG=platform npx tsx scripts/create-platform-admin.ts "Your Name" you@example.com'`, open the printed link, then manage workspaces at `https://admin.<ROOT_DOMAIN>/platform`.
5. **CTK moves to `https://ctk.<ROOT_DOMAIN>`** whenever convenient; its users sign in again there (sessions are per host). Re-register CTK's webhooks under the new host at leisure — the old host keeps working meanwhile.

## Turning on database row-level security

The database refuses to show or accept another organization's rows even if app code forgets a filter — but only once the app connects as a restricted role (the table owner is exempt, by design). Until then the policies exist but bind nothing. To switch it on:

1. On the droplet: `cd /opt/hclm-app && bash setup-app-db-role.sh` (synced there by every deploy). It creates the `hclm_app` role and prints two lines.
2. In `.env.production`: set `SYSTEM_DATABASE_URL` to the **current** `DATABASE_URL` (the owner — migrations and the few cross-org modules use it), and `DATABASE_URL` to the printed app-role URL. Then `docker compose up -d app`.
3. Roll back any time by pointing `DATABASE_URL` back at the owner URL and restarting.

New tables need a policy: end their migration with `SELECT ensure_tenant_policies();` (and `SELECT ensure_same_org_triggers();` if they reference other tenant tables) — the test suite fails until they do. CI runs the whole suite as a restricted role (`TEST_RLS=1`); to do the same locally you need a Postgres user that can create roles, e.g. `TEST_DATABASE_URL=postgresql://hclm:simpass@localhost:55432/hclm_test TEST_RLS=1 npm test` against a docker Postgres.

## Connecting Calendly, DocuSign, Stripe, Wise, Twilio and Teams

Each workspace connects its own accounts under **Admin → Integrations** (owners only); every card explains its setup, shows the webhook URL for that workspace, and has **Test connection**.

- **Calendly** — generate a Personal Access Token (Calendly → Integrations → API & Webhooks), save it, then click **Register webhook**: the app creates the subscription for this workspace's URL (`invitee.created` / `invitee.canceled`) with a signing key it generates and stores — Calendly never hands one out, so this step can't be done by hand. Optionally set the public booking page used as the fallback link in follow-up emails. Confirm with a real test booking landing on `/leads`.
- **DocuSign** — in DocuSign Admin → Apps and Keys create an integration key with an RSA keypair; save the integration key, API username (user GUID), account ID, auth server (`account-d.docusign.com` sandbox / `account.docusign.com` production) and the base64 of the private key PEM (`base64 -i private.pem | tr -d '\n'`). The card then shows the one-time consent link and the redirect URI to add to the key first — the consent must be granted in a real browser as the API user. Then **Register webhook** creates the Connect configuration with a generated HMAC key. Sandbox accounts can only send to addresses the developer account can receive.
- **Stripe** — add a webhook endpoint for the shown URL with `invoice.paid`, `invoice.voided`, `invoice.payment_failed`, `invoice.finalization_failed`, and paste the secret key and signing secret.
- **Meeting reminders** — Twilio (account SID, auth token, from number) sends texts/calls to everyone with "text/call before every meeting" checked in Admin → Users; a Teams incoming-webhook URL gets a post per meeting. Both are optional; email/in-app reminders to the Lead's assignee always work. (`postTeamsMessage` sends a plain `{"text": "..."}` body — a Workflows-based Teams webhook may expect a different shape.)

The legacy org (`ctk`) keeps using the older `CALENDLY_*` / `DOCUSIGN_*` / `STRIPE_*` / `TWILIO_*` / `MS_TEAMS_WEBHOOK_URL` / `WISE_*` env vars until an owner saves that integration; after that they can be removed from `.env.production`.
