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
   ```
   `RESEND_API_KEY`/`EMAIL_FROM` are optional — without them the app still works, it just logs a warning and skips email (in-app notifications still work). `HCLM_DOMAIN` (already required above for Caddy) doubles as the base URL for links inside notification emails. `GOOGLE_MAPS_API_KEY` is also optional — without it, Care Recipient addresses still save fine, they just don't get geocoded, so a Caregiver's clock-in skips the "near/far from the recipient's house" check (see src/lib/geocoding.ts). `CALENDLY_WEBHOOK_SIGNING_KEY` is optional too, but unlike the others there's no partial-degrade mode: without it, `/api/webhooks/calendly` 500s on every delivery attempt rather than silently skipping, since a webhook receiver that can't verify signatures must not accept payloads at all.
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
2. Run `CALENDLY_PAT=<token> HCLM_DOMAIN=your-domain.example npx tsx scripts/create-calendly-webhook.ts`. This looks up your Calendly organization and creates a webhook subscription for `invitee.created`/`invitee.canceled`, scoped to the whole organization, pointed at `https://your-domain.example/api/webhooks/calendly`. It prints a `signing_key`.
3. Set `CALENDLY_WEBHOOK_SIGNING_KEY` to that value in `.env.production` and restart the app.

The app must already be deployed and reachable at `HCLM_DOMAIN` before step 2 — Calendly needs to be able to reach the callback URL to accept the subscription. There's an unavoidable short gap between step 2 (subscription goes live) and step 3 completing (app restarted with the key) where a delivery would 500 — do step 3 immediately after step 2 to keep that gap small; Calendly retries failed deliveries, so a booking made in that narrow window still isn't lost.
