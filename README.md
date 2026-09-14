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

## Calendly integration setup

New bookings on `calendly.com/ctkadvisorsinc` land in the CRM as Leads (`/leads`) via a webhook — this only needs setting up once per environment, after the app is deployed and reachable at its real domain:

1. Generate a Personal Access Token: Calendly dashboard → Integrations → API & Webhooks → "Generate New Token." This is only used to run step 2 below — it's not the same thing as the signing key, and isn't stored as an app env var.
2. Run `CALENDLY_PAT=<token> HCLM_DOMAIN=your-domain.example npx tsx scripts/create-calendly-webhook.ts`. This looks up your Calendly organization, deletes any existing subscription on it (safe to re-run), and creates a fresh webhook subscription for `invitee.created`/`invitee.canceled`, scoped to the whole organization, pointed at `https://your-domain.example/api/webhooks/calendly` — generating its own signing key and handing it to Calendly (confirmed directly against the live API: Calendly doesn't generate and return one itself, unlike Stripe/DocuSign). It prints that generated key.
3. Set `CALENDLY_WEBHOOK_SIGNING_KEY` to that value in `.env.production` and restart the app.

The app must already be deployed and reachable at `HCLM_DOMAIN` before step 2 — Calendly needs to be able to reach the callback URL to accept the subscription. There's an unavoidable short gap between step 2 (subscription goes live) and step 3 completing (app restarted with the key) where a delivery would 400 — do step 3 immediately after step 2 to keep that gap small; Calendly retries failed deliveries, so a booking made in that narrow window still isn't lost. Calendly never echoes the signing key back afterward (same as DocuSign's Connect HMAC key), so the only real confirmation this worked is a live test delivery — book a real test slot once step 3 is done and confirm the Lead actually lands on `/leads`.

## Meeting reminders setup

24-hour and 30-minute-before reminders for each Lead's meeting (`src/lib/meeting-reminders.ts`, polled every 5 minutes from `src/instrumentation.ts`). Two independent pieces, set up either or both:

- **Teams + email, to whoever's assigned**: set a Lead's assignee from its row on `/leads`. Email/in-app always works (no setup). For Teams too, add an [Incoming Webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) to whichever Teams channel/chat should get reminder posts, and set `MS_TEAMS_WEBHOOK_URL` to it. The message names the assignee in the text — a plain webhook posts to a channel, not a true per-person DM, so it reads "assigned to Jane," not an @-mention that actually pings Jane. (Microsoft has been steering admins toward Workflows-based webhooks, built in Power Automate, instead of the classic connector — if your webhook was set up that way and messages don't show up, check what JSON shape that specific flow expects; `postTeamsMessage` in `src/lib/teams.ts` currently sends a plain `{"text": "..."}` body.)
- **SMS + call, to a fixed roster**: from Admin → Users, edit anyone who should get a text (and, for the 30-minutes-before reminder only, an automated call) for *every* upcoming meeting — add their phone number and check "Send this person a text/call before every upcoming meeting." This is independent of assignment; check the box for as many people as should get it (e.g. Ms. Nelia). Needs a [Twilio](https://www.twilio.com/) account: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (a phone number on that account, capable of SMS and voice).

## DocuSign integration setup

Signing now goes entirely through DocuSign — send a document for signature from an Application's Files tab or a Client's Agreements card (pick an existing PDF or upload one, click where the signature goes, enter the signer's name/email), track its status (sent/viewed/signed/declined/voided) and expiry right there, and get notified when it's signed. This replaces the old in-app "draw your own signature and flatten it onto a PDF" flow entirely — that flow's own history isn't touched, it's just not how new documents get signed. None of this works until the setup below is done; there's no partial-degrade mode for the send flow itself.

1. Create a DocuSign **Developer (sandbox)** account at [developers.docusign.com](https://developers.docusign.com/) if you don't have one yet — it's free, and separate from a production "Go-Live" account (out of scope here).
2. In that account's Admin → Apps and Keys, create an **Integration Key** → `DOCUSIGN_INTEGRATION_KEY`. On the same key, click **Add RSA Keypair** — DocuSign shows the private key exactly once, copy it immediately, then base64-encode the whole PEM text (`base64 -i private.pem | tr -d '\n'` or equivalent) → `DOCUSIGN_PRIVATE_KEY`.
3. Still in Admin → Users, find the sending user's **API Username** (a GUID, not their login email) → `DOCUSIGN_USER_ID`, and the **Account ID** → `DOCUSIGN_ACCOUNT_ID`.
4. **Unavoidable one-time interactive step**: while logged into DocuSign as that user, in a real browser, visit:
   ```
   https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=<DOCUSIGN_INTEGRATION_KEY>&redirect_uri=<any URI registered on the Integration Key>
   ```
   and click **Allow**. Every token request fails with `consent_required` without this, no matter how correct the keypair is — there's no way around a real browser visit for the very first grant.
5. Set the five env vars above (`DOCUSIGN_AUTH_SERVER` defaults to the sandbox host, `account-d.docusign.com` — production is `account.docusign.com`), deploy, restart.
6. Run `HCLM_DOMAIN=your-domain.example npx tsx scripts/create-docusign-connect.ts` (once the app is deployed and reachable there) — it authenticates with the app's own credentials, creates a Connect (webhook) subscription pointed at `https://your-domain.example/api/webhooks/docusign`, and prints an HMAC key. (Whether Connect hands back the HMAC key on creation or expects one supplied by us can vary by account type — the script surfaces whatever DocuSign actually returns; adjust it if your account works differently.)
7. Set `DOCUSIGN_WEBHOOK_HMAC_KEY` to that value, restart. Same short unavoidable gap as the Calendly runbook above — DocuSign retries failed deliveries, so nothing sent in that window is lost, just delayed.
8. Send your first real test to your own email — DocuSign sandbox accounts can only send to addresses the developer account has access to.
