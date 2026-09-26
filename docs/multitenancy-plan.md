# Multitenancy plan

Status (2026-09-26): **Phase 0 + 1 on branch `multitenancy/phase-1`, Phase 2 on `multitenancy/phase-2`, Phase 3 on `multitenancy/phase-3`** (each built on the previous). Nothing merged or deployed. Plan drafted 2026-09-24.

**Resume point (2026-09-26):** Phase 3 complete on `multitenancy/phase-3` (3a–3e, see its status block). Next:
1. Re-run the migration rehearsal with Docker running: `docker build --target migrator -t hclm-migrate:phase3 .` then `SKIP_PULL=1 bash rehearse-migration.sh hclm-migrate:phase3` against the simulated droplet stack (last rehearsed at Phase 1 only).
2. Phase 4 — per-org integrations (`OrganizationIntegration`, encrypted secrets, webhook routing by host, Admin > Integrations).

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
- Tested locally (2026-09-26) against a simulated droplet stack (same compose service names, Postgres 16, local dev data rolled back to pre-Phase-1): the deploy backup step (incl. keep-last-7 retention), the documented restore, a clean Phase 1 rehearsal (OK, only `organizations` new), and a deliberately destructive migration (reported `LOST audit_logs` / `DROPPED _ClientToProject`, exit 1). Not yet run on the real server.

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

Rehearsed (2026-09-26) with the real migrator image (`docker build --target migrator`, which also runs `next build` — passes) against the simulated prod copy: applied cleanly, no rows lost.

Rollback: `scripts/multitenancy-phase1-down.sql` (drops the 53 columns, `organizations`, `OrgStatus`, and the `_prisma_migrations` row; refuses to run once a second org exists). Tested against the simulated copy.

**Known gap:** `_ClientToProject` (the implicit Client↔Project many-to-many) can't carry a column — Prisma owns implicit join tables. Both sides are org-scoped, so no data leaks through it, but Phase 6 needs a policy on it. Convert it to an explicit `ClientProject` model with `organizationId` in Phase 2 or 3 (touches the `clients`/`projects` connect/set code).

## Phase 2 — Tenant context + `tenantDb()`

**Goal:** every query scoped. Org resolved from subdomain + session. Still one tenant in prod.

**Status — implemented 2026-09-26 on `multitenancy/phase-2`:**
- `src/lib/db.ts` (`db`, `tenantDb`, `runAsTenant`, `forEachActiveOrg`), `src/lib/tenant.ts` + `src/lib/tenant-host.ts`; all 55 app files moved off the raw client; ESLint `no-restricted-imports` on `@/lib/prisma`.
- Org default is `current_org_id()` (SQL function) — Prisma can't introspect a bare `NULLIF(current_setting(...))` default and re-generated it on every `migrate dev`.
- 118 same-org triggers + the `_ClientToProject` join trigger (`ensure_same_org_triggers()`).
- Auth: session carries `organizationId`/`orgSlug`; checked in the proxy's `authorized()` and `requireSession()`; user lookups scoped to the host org. Unknown host → "workspace doesn't exist" on login, 404 on public forms.
- Jobs loop orgs; email links use the org's URL; scripts/seeds run as `ORG_SLUG` (default `ctk`).
- vitest suite (27 tests, real Postgres) + a `test` job gating `build-and-push` in `deploy.yml`.
- Verified in the running app (Playwright against `next dev`): all main pages in single-tenant mode; in multi-tenant mode (`ROOT_DOMAIN=localhost`) CTK login at `ctk.localhost`, CTK credentials rejected at `other.localhost`, a hand-copied CTK session cookie rejected on `other.localhost`, bare/unknown hosts have no tenant.

**Deviations from the design below:**
- No `x-org-id` header from the proxy: server code reads the `host` header directly (`getHostOrg()`), and the proxy compares the JWT's `orgSlug` with the host's slug — no DB lookup in the proxy.
- `NEXTAUTH_URL`/`AUTH_URL` must be unset (they pin every sign-in redirect to one host). Prod never set it; local `.env` files that do must drop it.

**Open from Phase 2:**
- ~~`orgId` in server error logs~~ — done: `onRequestError` in `src/instrumentation.ts` logs `[tenant <slug>] <routeType> <method> <path> failed (digest …)`.
- `pg` warns "client.query() while already executing a query" when Prisma runs an `include`'s relation queries in parallel inside a transaction; the per-statement `set_config` transaction makes that happen for most queries. Harmless on pg 8 (it queues); `pg` is pinned `^8`. Revisit before any pg 9 upgrade (Prisma adapter issue).
- Server actions that validate an id and then write are covered by the triggers + scoped where; no per-action cross-tenant tests yet (the suite tests the client and the DB layer).

**2a. Spike — done 2026-09-26** (Prisma 7.8 + adapter-pg, Postgres 16, two orgs; scripts kept out of the repo). Findings:

| Question | Result |
|---|---|
| Query extension adds `organizationId` to `findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany` | ✅ other org's rows invisible / untouched |
| `findUnique/update/delete` with extra `organizationId` in the unique `where` | ✅ other org's id → `null` / "record not found" |
| `upsert` on another org's id | ✅ creates a new row in the caller's org, other org's row untouched |
| Static `@default("org_ctk")` | ⚠️ Prisma sends the literal in the INSERT — a DB default is never consulted. Must become `dbgenerated(...)` |
| `dbgenerated` default from `set_config` | ✅ top-level and nested creates get the right org |
| Missing `set_config` | Plain `current_setting('app.org_id')` returns `''` on a reused connection → confusing FK error. Use `nullif(current_setting('app.org_id', true), '')` → clean NOT NULL violation |
| Interactive tx on a filter-only extended client + `set_config` first | ✅ filters kept, creates stamped, rollback works |
| `tenantDb.$transaction(async tx => …)` with the per-query `set_config` wrapper | ❌ **not atomic** — each inner query runs in its own tx; writes survive a throw |
| `tenantDb.$transaction([...])` (array form) | ❌ **not atomic** for the same reason |
| Cross-tenant FK (`clientGroupId` of another org, or `connect`) | ❌ **leaks** — `include` returns the other org's parent. RLS wouldn't catch it |
| Raw-SQL composite FK `(fk, organizationId)` | Blocks it and coexists with Prisma `SetNull`, but `prisma migrate diff` wants to DROP it (drift) |
| Composite relation declared in Prisma | ❌ `SetNull` would null the required `organizationId`; `connect` would copy the *parent's* org onto the child (cross-tenant write) |
| `BEFORE INSERT/UPDATE` trigger checking parent org | ✅ blocks scalar FK, `connect`, and update-to-other-org; `SetNull` still works; invisible to Prisma drift |
| Overhead of per-query `set_config` tx | ~+1.6 ms/query on Docker Desktop (Windows); expect less on the droplet. Accepted |

**2b. Design (from the spike):**
- `src/lib/db.ts` → `tenantDb(orgId)`: filter extension (reads AND `organizationId`; unique ops add it to the unique `where`) + a wrapper that runs every standalone query as `$transaction([set_config, query])`.
- `tenantDb(orgId).$transaction` is **overridden**: interactive form → one real transaction on the filter-only client with `set_config` first. Array form **throws** — the 7 existing array call sites (`files.ts` ×2, `invoice-profiles.ts`, `mco.ts`, `stage.ts`, `tasks.ts`, `time-entries.ts` ×2) are rewritten to the interactive form.
- Column default on every table: `@default(dbgenerated("nullif(current_setting('app.org_id', true), '')"))`.
- `src/lib/tenant.ts`: `requireOrg()` (session org must equal host org, else sign out); `publicOrg()` (host only, for `/forms/*`).
- Raw `$queryRaw` / `$executeRaw` are not scoped by the extension — banned outside the allowlist.

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

**2e'. Cross-tenant FK linking (must ship with 2e) — decided by the spike: triggers.**
Most writes pass FK ids straight from input; nothing in Prisma or RLS stops a child pointing at another org's parent (then `include` leaks the parent). Fix: one generic plpgsql function `assert_same_org(parent_table, fk_column)` and a `BEFORE INSERT OR UPDATE OF <fk>, "organizationId"` trigger per tenant-to-tenant FK (including `User` FKs like `createdById`/assignees), generated from the Prisma schema by a script into a migration. Raises `foreign_key_violation`. Prisma's drift detection ignores triggers, so no fights with `migrate dev`. A CI check (Phase 6's policy check) also asserts every FK column has its trigger. `_ClientToProject` gets a custom two-sided trigger or becomes an explicit model first.
Cost: one PK lookup per FK column per write.

**2f. Tests (new):** vitest + test Postgres (docker-compose.dev). `tenantDb` unit tests per operation. Cross-tenant suite: seed org A + B, every list/get action as A returns no B rows; update/delete of B ids as A is a no-op; creating a child that references a B parent as A fails. Add a CI test job with a Postgres service.
Lint/review rule for later: any future Next.js cache key must include the org id.

Risk: largest phase — mitigated by spike, per-area PRs, lint rule.

## Phase 3 — Uniques, numbering, storage, Illinois enums

**Status — implemented 2026-09-26 on `multitenancy/phase-3`** :
- 3a: per-org unique keys (user email, service type name, pipeline stage, form slug, manual invoice number). `friendlyPrismaError` strips `organizationId` from reported fields so `duplicateMessages` keys still match.
- 3b: `org_counters` + `next_invoice_seq()`/`next_receipt_seq()` column defaults — per-org, gap-free, rollback-safe; existing numbers continue from max.
- 3c: new GCS keys under `org/<orgId>/`.
- 3d: `picklist_options` (AGENCY / PAYER / BALL_WITH per org); the enum columns became text with values unchanged (hand-written migration — Prisma's diff would have dropped the columns); pickers, validation, audit labels and dashboard MCO alerts read the org's lists; Admin > Lists (add / rename / retire / restore, audited).
- 3d': `PipelineStage.role` (5 roles) backfilled from the old abbrev rules; aging alerts match on role.
- 3e: `seedOrganization()` (`src/lib/org-seed.ts`) — stage catalog (moved to `src/lib/pipeline-stage-catalog.ts`; "CTK" in stage names → org name), generic case types, default picklists, default invoice profile. Deliberately **not** seeded for new orgs: license types, checklists, service types (state/business-specific) — revisit if tenants want CTK's set as a template.
- Verified: typecheck, lint, 52 tests, `next build`, smoke of 13 pages, Admin > Lists driven in the browser (add, duplicate rejected, rename, retire keeps existing cases' label).
- Not yet: stage roles/names editable in the UI (stages still come from the catalog); migration rehearsal of Phases 2–3 on a prod-like copy (Docker was down).


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
| 0 Backups + rehearsal script | done (tested locally, not yet on server) |
| 1 Schema + backfill | 1–2 d |
| 2 Tenant context + call sites + FK triggers + tests | done (branch) |
| 3 Uniques / numbering / storage / lookups / stage roles | done (branch) |
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
