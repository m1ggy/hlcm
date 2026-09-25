# Multitenancy plan

Status: **Phase 1 implemented on branch `multitenancy/phase-1`** (not deployed). Plan drafted 2026-09-24.

Note: columns are camelCase like the rest of the schema — the DB column is `"organizationId"`, not `organization_id`.

Goal: turn HCLM from a single-org internal CRM (CTK) into a SaaS that other
healthcare licensing consultancies can sign up for, each fully isolated.

## Decisions made

| Question | Decision |
|---|---|
| Who are tenants? | Other licensing consultancies (true SaaS), not CTK's own clients |
| Can a user belong to several orgs? | **No** — `User.organizationId`, no Membership table. Role stays on `User` |
| Tenant resolution | **Subdomain** per tenant (`acme.<root-domain>`) |
| Integrations (Stripe, DocuSign, Calendly, Wise, Twilio, Teams) | **Each tenant brings its own** accounts/credentials |
| Postgres RLS | **Yes**, as Phase 6. Phase 2 already pays the per-query transaction cost (`set_config` feeds the column default), so the remaining cost is just policies + roles |
| Staging | **Single server** — no staging box. Migrations rehearsed on a scratch copy of the live DB on the prod server, plus an automatic backup before every migrate (Phase 0) |

## Current state (what has to change)

- 53 models, none tenant-scoped. ~120 files call the global `prisma` singleton (`src/lib/prisma.ts`). No raw SQL in app code.
- 19 `$transaction` calls across 9 files; 137 `findUnique` calls.
- Globally unique fields that must become per-org: `User.email`, `ServiceType.name`, `PipelineStage(pipeline, abbrev)`, `FormTemplate.slug`, `Invoice.invoiceNumber`, plus `autoincrement` `seq` on Invoice/Receipt.
- Integrations are env-var singletons (`src/lib/stripe.ts`, `docusign.ts`, `calendly.ts`, `wise.ts`, `twilio.ts`, `teams.ts`, `email.ts`); webhook routes assume one account.
- Hardcoded branding: "HCLM"/"CTK" in layouts, sidebar, login, portal, `email.ts` BRAND, `totp.ts` issuer, `invoice-pdf.ts`, invoice email subject, Calendly cancel reason, meeting reminders, notifications. `BallWith.CTK` enum value.
- Illinois-specific enums: `Agency` (IDPH/IDoA/IDHS), `McoName` (IL payers), `BallWith`.
- Background jobs in `src/instrumentation.ts` (digest, meeting reminders) run globally.
- GCS storage keys are flat UUIDs.
- `DEVELOPER` role is a break-glass superuser — should become a platform-level flag.
- No test framework. No invite or password-reset flow.
- Aging alerts (`src/lib/aging-alerts.ts`) match stages by hardcoded abbrev suffix (`SVR`, `WCD`); `STATUS_TO_STAGE` in `src/lib/pipeline.ts` hardcodes abbrevs too.
- `src/lib/email.ts` builds every email link from `HCLM_DOMAIN`; `.env` pins `NEXTAUTH_URL` to one host.
- No Next.js data caching in use (`use cache`, `unstable_cache`, `revalidateTag`) — nothing to re-key per org today.
- Agency/payer enum values are labels only — no business logic branches on `IDPH`, `AETNA`, etc.

## Architecture

- **Shared DB + `organizationId` column on every tenant table** (including child tables like `InvoiceLineItem`, `TaskAssignee`) so every table can be isolated on its own column.
- **App layer:** `tenantDb(orgId)` Prisma client extension auto-injects `organizationId` into where/create/upsert. ESLint bans importing raw `@/lib/prisma` outside an allowlist.
- **DB layer (Phase 6):** Postgres RLS on `current_setting('app.org_id')`, set per transaction.
- **Per-org integrations** in an encrypted `OrganizationIntegration` table.
- **Per-org reference data** (pipeline stages, service types, case types, license types, checklist templates, document templates, invoice profiles, agencies, payers) seeded on org creation.

---

## Phase 0 — Safe migrations on a single server

**Goal:** rehearse every migration against real data before it touches prod, without a second server. (Decided 2026-09-26: single server, no separate staging box.)

Existing setup: `deploy.yml` already has two environments — push to `dev` → dev, push to `main` → production. App-level testing happens on `dev`; what was missing is testing *migrations* against real data, and a backup before migrating.

- **Pre-migration backup (every deploy, automatic):** the deploy step now runs `pg_dump -Fc` into `<deploy path>/backups/pre-migrate-<utc timestamp>.dump` right before `migrate`, owner-only perms, last 7 kept. Restore:
  ```bash
  docker compose stop app
  docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/pre-migrate-<ts>.dump
  docker compose up -d app   # with the previous app image
  ```
- **Migration rehearsal (manual, before merging a risky migration to `main`):** `scripts/rehearse-migration.sh`, synced to the deploy directory on every deploy. Copies the live DB into a scratch `hclm_rehearsal` database in the same Postgres container, runs the given migrator image against it, diffs per-table row counts (fails on any lost rows/tables), then drops the copy. PHI never leaves the server.
  ```bash
  cd /opt/hclm-app
  bash rehearse-migration.sh ghcr.io/<owner>/<repo>:migrate-dev-latest
  ```
  Flow per risky phase (1, 3, 6): merge phase branch → `dev` (builds `migrate-dev-latest`, deploys to dev) → run the rehearsal on the prod server with that image → merge → `main`.
- Rehearsal load: one `pg_dump` of prod + a restore into the same Postgres — run off-hours.
- Not yet run end-to-end (no Docker locally); first real run is the Phase 1 rehearsal.

## Phase 1 — Organization model + backfill

**Goal:** every row belongs to an org. Zero behavior change, zero app-code change.

Schema:
```prisma
model Organization {
  id        String    @id @default(cuid())
  slug      String    @unique   // subdomain
  name      String
  status    OrgStatus @default(ACTIVE)  // ACTIVE | SUSPENDED
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```
- Add `organizationId String` + relation + `@@index([organizationId])` to all 53 tenant models.
- Temporary `@default("org_ctk")` so existing creates keep working unchanged (removed in Phase 2).

Migration `20260925154029_add_organizations` (generated with `--create-only`, then hand-edited):
1. `ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org_ctk'` on every table — Postgres fills existing rows from the constant default, so no separate UPDATE/backfill step is needed (and on PG 11+ it's metadata-only, no table rewrite).
2. Create `organizations`; hand-added `INSERT` of CTK (`id = 'org_ctk'`, `slug = 'ctk'`, `name = 'CTK'`) before the foreign keys.
3. Index + FK (`ON DELETE RESTRICT`) per table.

Also: update `prisma/seed.ts`, `scripts/seed-*.ts`, `scripts/reset-data.sql` to create/keep the CTK org.

Verify: run on a restored prod dump; row counts unchanged, no null `organizationId`; smoke-test main pages. Risk: low.

Done locally (2026-09-25): migration applied; `scripts/seed-demo.ts` run afterwards with no code changes (nested creates included) → 148 rows across 53 tables, all in `org_ctk`; `tsc` + eslint clean. The local DB is nearly empty, so the Phase 0 rehearsal against a copy of prod is still required before deploying to `main`.

**Known gap:** `_ClientToProject` (the implicit Client↔Project many-to-many) can't carry a column — Prisma owns implicit join tables. Both sides are org-scoped, so no data leaks through it, but Phase 6 needs a policy on it. Convert it to an explicit `ClientProject` model with `organizationId` in Phase 2 or 3 (touches the `clients`/`projects` connect/set code).

## Phase 2 — Tenant context + `tenantDb()`

**Goal:** every query scoped. Org resolved from subdomain + session. Still one tenant in prod.

**2a. Spike first (1–2 days):** prove the Prisma 7 + adapter-pg extension pattern — all operation types (`findUnique` with extra `organizationId`, `upsert`, `updateMany`, nested `create`), interactive transactions (does a `tx` from an extended client keep query extensions?), and `set_config('app.org_id', …, true)` in the same tx.

**2b. Design (if spike passes):**
- `src/lib/db.ts` → `tenantDb(orgId)`: reads AND `organizationId` into where; unique ops add it to the unique where; writes run `set_config` first in the same tx.
- Column default becomes `dbgenerated("current_setting('app.org_id')")` — covers nested creates; a missing setting throws instead of writing to the wrong org.
- Fallback if spike fails: drop the default, pass `organizationId` explicitly on every create (TS enforces).
- `withTenantTx(orgId, fn)` for the 19 interactive transactions.
- `src/lib/tenant.ts`: `requireOrg()` (session org must equal host org, else sign out); `publicOrg()` (host only, for `/forms/*`).

**2c. Host resolution (`src/proxy.ts`):**
- Parse `<slug>.<ROOT_DOMAIN>` → org lookup (in-memory cache, 60s TTL) → set internal `x-org-id` header (strip any incoming one).
- Unknown slug → 404; suspended → suspended page.
- Transition fallback: current `HCLM_DOMAIN` → CTK, so prod works until wildcard DNS (Phase 5).
- Dev: `ctk.localhost:3000`.

**2d. Auth + host-aware URLs:**
- `authorize()` → `findFirst({ organizationId: hostOrg, email })` (compound unique in Phase 3).
- MFA challenge carries org id, checked against host.
- JWT/session gain `organizationId`; update `src/types/next-auth.d.ts`. Old tokens without it = logged out (15-min sessions, harmless).
- Remove `NEXTAUTH_URL` / `AUTH_URL` pinning so redirects follow the request host (`trustHost` is already on).
- `appUrl(org)` helper → `https://<slug>.<ROOT_DOMAIN>` (CTK falls back to `HCLM_DOMAIN` until Phase 5). Replace `HCLM_DOMAIN` usage in `src/lib/email.ts`; jobs (no request) build links from the org, not the host.
- Add `orgId` to server error logs and audit output so incidents trace to a tenant.

**2e'. Cross-tenant FK linking (must ship with 2e):**
Most writes pass FK ids straight from input (`clientId: input.clientId`, stage/assignee ids). The column default stamps the *current* org on the new row but nothing checks the linked parent is in that org — org A could attach an Invoice to org B's Client, then `include: { client }` leaks B's data. RLS does **not** catch this (FK checks bypass RLS). Pick one in the spike:
- **DB:** composite FKs `("clientId", "organizationId") → clients(id, "organizationId")` with `@@unique([id, organizationId])` on parents. Verify Prisma drift detection doesn't try to drop raw-SQL FKs, and that it coexists with `SetNull` relations.
- **App:** `tenantDb` validates every incoming FK scalar / `connect` id with an `assertOwned()` lookup in the current org.
Cross-tenant test suite must cover "create child pointing at other org's parent" either way.

**2e. Call-site migration** in per-area PRs: clients → applications → tasks → invoices → care recipients → leads/forms → admin → lib helpers (`rbac.ts`, `audit.ts`, `notifications.ts`, `pipeline.ts`, `caregiver-scope.ts`, search).
Raw-client allowlist: `auth.ts`, webhooks, instrumentation jobs, `platform/`, seeds/scripts. Enforced by ESLint `no-restricted-imports`.

**2f. Tests (new):** vitest + test Postgres (docker-compose.dev). `tenantDb` unit tests per operation. Cross-tenant suite: seed org A + B, every list/get action as A returns no B rows; update/delete of B ids as A is a no-op; creating a child that references a B parent as A fails. Add a CI test job with a Postgres service.
Lint/review rule for later: any future Next.js cache key must include the org id.

Risk: largest phase — mitigated by spike, per-area PRs, lint rule.

## Phase 3 — Uniques, numbering, storage, Illinois enums

**3a. Uniques → per-org:**

| Current | New |
|---|---|
| `User.email @unique` | `@@unique([organizationId, email])` |
| `ServiceType.name @unique` | `@@unique([organizationId, name])` |
| `PipelineStage @@unique([pipeline, abbrev])` | `[organizationId, pipeline, abbrev]` |
| `FormTemplate.slug @unique` | `[organizationId, slug]` |
| `Invoice.invoiceNumber @unique` | `[organizationId, invoiceNumber]` |
| `McoCredential @@unique([clientId, mcoName])` | `[clientId, payerId]` (with 3d) |

External ids (`stripeInvoiceId`, `docusignEnvelopeId`, `calendlyInviteeUri`) and 1:1 `userId` stay globally unique.

**3b. Numbering:** `OrgCounter(organizationId, kind, next)` (kind = INVOICE_DRAFT | RECEIPT). `nextSeq(tx, kind)` via `UPDATE … SET next = next + 1 RETURNING next` in the insert's tx. `Invoice.seq` / `Receipt.seq` drop autoincrement, gain `@@unique([organizationId, seq])`. Backfill CTK counters = `max(seq) + 1` so displayed numbers don't change.

**3c. Storage:** new keys `org/<orgId>/<uuid>.<ext>` (`saveUploadedFile`, logo upload). Old flat keys keep working (full key stored in DB); optional script to move CTK files. Download routes go through `tenantDb` → other org's file id = 404.

**3d. Enums → per-org lookup tables:**
- `Agency` → `Agency(id, orgId, code, label, sortOrder, active)`
- `McoName` → `Payer(...)`
- `BallWith` → `ResponsibleParty(...)` — CTK's "CTK" row becomes the org's own name
- Migration: create tables → insert CTK rows from enum values → add FK columns → map enum → id → drop enum columns/types.
- Update pickers/labels: `application-properties-table.tsx`, `applications.ts`, `mco.ts`, `audit-format.ts` (keep a legacy-string fallback for old audit JSON). Admin CRUD pages like case types. `Pipeline` enum stays.
- Low risk: the enum values are labels only, no logic branches on them.

**3d'. Stage roles:** per-org stage lists mean a tenant can rename abbrevs and silently break aging alerts. Add `PipelineStage.role` (nullable enum: `SUPERVISOR_REVIEW`, `WAITING_CLIENT_DOCS`, … one per rule in `aging-alerts.ts`, plus the targets `STATUS_TO_STAGE` needs). Backfill CTK's stages from their current abbrevs; switch `computeAgingAlerts` to match on role instead of `endsWith`. Seeded stages carry roles; admin UI lets a tenant assign a role to a custom stage.

**3e. `seedOrganization(orgId)`** extracted from `scripts/seed-pipeline-stages.ts`, `seed-service-types.ts`, `seed-reference-data.ts`: pipeline stages, service types, case types, license types, checklist templates, agencies, payers, responsible parties, default invoice profile.

Risk: medium — rehearse the enum migration on a prod copy.

## Phase 4 — Per-org integrations + jobs

```prisma
model OrganizationIntegration {
  id               String @id @default(cuid())
  organizationId   String
  provider         IntegrationProvider // STRIPE | DOCUSIGN | CALENDLY | WISE | TWILIO | TEAMS
  config           Json    // non-secret: accountId, fromNumber, authServer, taxEnabled…
  secretsEncrypted Bytes   // AES-256-GCM
  keyVersion       Int
  status           IntegrationStatus // NOT_CONFIGURED | CONNECTED | ERROR
  lastVerifiedAt   DateTime?
  @@unique([organizationId, provider])
}
```
- `src/lib/secrets.ts` with `INTEGRATION_ENCRYPTION_KEY` env; `keyVersion` for rotation.
- `stripe.ts`, `docusign.ts` (per-org token cache), `calendly.ts`, `wise.ts`, `twilio.ts`, `teams.ts` take `orgId`; clean "not configured" error.
- Platform-owned (not per tenant): Resend (per-org display name + reply-to; custom sending domain later), Google Maps geocoding, ClamAV, GCS.
- Webhooks: tenant points at `acme.<domain>/api/webhooks/{stripe,docusign,calendly}`; host → org → verify with that org's secret; handlers use the system client with an explicit org.
- Admin → Integrations page: per-provider credentials form + "Test connection". Port `scripts/create-calendly-webhook.ts` / `create-docusign-connect.ts` into "Register webhook" buttons; generate DocuSign consent URL per org. README runbooks → in-app help.
- Jobs (`instrumentation.ts`): loop active orgs, each under its own context. Add `Organization.timezone` so the 8am digest is per org. SMS roster + Teams URL per org.
- CTK cutover: one-off script copies current env values into CTK's integration rows; keep env fallback for CTK one release, then remove.

Risk: medium — test webhook cutover in Stripe/DocuSign sandbox first.

## Phase 5 — Platform admin, onboarding, subdomains live

- Organization gains `displayName`, `shortName`, `logoStorageKey`, `supportEmail`, `timezone`, optional brand color.
- `User.isPlatformAdmin` replaces the `DEVELOPER` role; platform admins live in a reserved `platform` org and log in at `admin.<domain>`. Console: list/create/suspend orgs, integration status. No impersonation in v1 (HIPAA); maybe audited "view as" later.
- Create-org flow: slug (regex + reserved words: `www`, `admin`, `api`, `app`, `platform`, `mail`, `status`, `docs`, `help`) → create org → `seedOrganization()` → first OWNER + invite email.
- New `AuthToken(userId, kind: INVITE | PASSWORD_RESET, tokenHash, expiresAt, usedAt)` + `/set-password` page (also gives the app a password reset).
- De-hardcode branding: `layout.tsx` title, `app-sidebar.tsx`, `login/page.tsx`, portal layout, `email.ts` BRAND, `totp.ts` issuer (new enrollments only), `invoice-pdf.ts` fallback, invoice email subject, `leads.ts` Calendly cancel reason, `meeting-reminders.ts`, `notifications.ts`.
- Infra: wildcard DNS `*.domain` → droplet. Caddy on-demand TLS with an `ask` endpoint `/api/tls-check?domain=` (200 only for existing org slugs) — no custom Caddy build:
  ```
  { on_demand_tls { ask http://app:3000/api/tls-check } }
  *.{$ROOT_DOMAIN}, {$ROOT_DOMAIN} { tls { on_demand } reverse_proxy app:3000 }
  ```
  Cookies stay host-only (default). Confirm next-auth builds callback URLs from the request host.
- CTK cutover to `ctk.<domain>`; old domain stays as an alias (`Organization.domainAliases`) so existing webhooks/bookmarks work. Redirect browsers, not webhooks.
- Root domain login: "find your workspace" page — enter email → email the matching workspace link(s). Never reveal on-page whether an email exists.
- **Tenant billing (platform charges consultancies):** platform-owned Stripe account (separate from each tenant's own Stripe) with Stripe Billing subscriptions; `Organization.plan`, `subscriptionStatus`, `stripeCustomerId`; platform webhook at `admin.<domain>/api/webhooks/platform-stripe`; unpaid past grace → `SUSPENDED` (read-only first, then locked). Pricing model (flat / per-seat / per-client) TBD.
- **Offboarding:** per-org export (all DB rows as JSON/CSV + GCS files under `org/<orgId>/` zipped) and hard-delete script. Also covers "restore one tenant" — shared-DB backups can't restore a single org, so the export doubles as a per-tenant backup.

## Legal / compliance (not code, can block launch)

- The platform becomes a **Business Associate** of every tenant: need a BAA template tenants sign.
- BAAs from every subprocessor that touches PHI: hosting (verify DigitalOcean offers one — not confirmed), GCS, Resend, Twilio, and anything else in the data path. Swap vendors that won't sign.
- Terms of service, privacy policy, subprocessor list.

## Phase 6 — RLS

**Why:** the app-layer filter only protects queries that go through it. RLS makes Postgres itself refuse cross-tenant rows — catches raw-client mistakes, future `$queryRaw`, bad `updateMany`/`deleteMany` where clauses, extension bugs. Does **not** catch cross-tenant `connect: { id }` (FK checks bypass RLS) or intra-tenant RBAC bugs.

**Cost:** each query becomes BEGIN/set_config/query/COMMIT (~3–4 round trips; Postgres is on the same docker network, ~0.2–0.5ms each — a few ms per page). Needs separate DB roles; every new table needs a policy.

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
```

- Roles: `hclm_owner` (owns tables, migrations — `MIGRATE_DATABASE_URL`), `hclm_app` (CRUD, not owner, `NOBYPASSRLS` — `DATABASE_URL`), `hclm_system` (`BYPASSRLS` for jobs, webhook org lookup, platform console, proxy org lookup — `SYSTEM_DATABASE_URL`). `ALTER DEFAULT PRIVILEGES` for new tables.
- Migration: ENABLE + FORCE + policy on every table with `organizationId`. `organizations` readable only by system role (or current org's row).
- Guards: CI script fails if any `organizationId` table lacks a policy in `pg_policies`; dev-only policy raises when `app.org_id` unset. Cross-tenant FK linking is handled in Phase 2 (2e') — RLS doesn't cover it.
- Rollout: measure page p95 before/after; run on prod copy; enable in prod. Rollback = `DISABLE ROW LEVEL SECURITY` migration.

## Cross-cutting

- **Order:** 0 before any prod deploy. 1 → 2 strict. 3 and 4 can overlap. 5 needs 3 + 4. 6 any time after 2, must land before a second real tenant. Legal work runs in parallel.

Rough effort (solo dev + Claude):

| Phase | Estimate |
|---|---|
| 0 Backups + rehearsal script | done (untested on server) |
| 1 Schema + backfill | 1–2 d |
| 2 Tenant context + call sites + FK ownership + tests | 2–3 w |
| 3 Uniques / numbering / storage / lookups / stage roles | 1 w |
| 4 Integrations + jobs | 1–1.5 w |
| 5 Platform admin, onboarding, TLS, billing, offboarding | 1.5–2 w |
| 6 RLS | 3–5 d |
| **Total** | **~7–9 w** |

---

## Product name + domain brainstorm (undecided)

"HCLM" is an acronym that means nothing to a new customer — keep it as the internal codename (repo, containers), pick a customer-facing name. Criteria: says who it's for, not Illinois-specific, spellable over the phone.

Availability checked via RDAP on 2026-09-24 ("no record" = likely available, not guaranteed; premium/reserved names possible). **Do a USPTO trademark search (class 42) before committing** — several taken names are real companies (e.g. Permitflow).

| Theme | Name | `.com` | `.app` |
|---|---|---|---|
| Approval / process | **Permitwell** | no record ✅ | no record ✅ |
| Approval / process | **Filingwell** | no record ✅ | unknown (rate-limited) |
| Multi-state | **Stateline HQ** | no record ✅ | no record ✅ |
| Multi-state | **Statebound HQ** | no record ✅ | no record ✅ |
| Licensure | **Licensure HQ** | no record ✅ | no record ✅ |
| Licensure | Licentra, Licensa, Licenzo, Licenseward | taken | no record |
| Approval / process | Charterwell, Caseward, Caseharbor | taken | no record |
| Credentialing | Credwise, Credwell, Credara | taken | no record |

Taken on both: Licensely, Charterly, Permitflow, Casewell, Surveyready, Permitpath, Credpath, Licensable, Surveywise.

Current favorites: 1) Permitwell, 2) Licensure HQ, 3) Stateline.

**Domain layout — recommended option B:**
- A (one domain): `brand.com` marketing, `acme.brand.com` tenants, `admin.brand.com` console. Simple; needs reserved-subdomain list.
- **B (split):** `brand.com` marketing + email sending (SPF/DKIM on `mail.brand.com`); `acme.brand.app` tenants, `admin.brand.app` console. Keeps marketing and tenant apps apart (cookies, TLS); `.app` forces HTTPS in every browser. ~$15/yr for the extra domain.
- Avoid multi-level (`acme.app.brand.com`).

## Open questions

1. Product name + root domain (brainstorm above).
2. CTK slug — `ctk`?
3. Email: platform Resend with per-tenant display name only, or tenant-owned sending domains?
4. Tenant pricing model (flat / per-seat / per-client).
5. FK ownership approach (composite FKs vs app-level `assertOwned`) — decided by the Phase 2 spike.
