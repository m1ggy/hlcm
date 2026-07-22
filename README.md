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
   ```
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
