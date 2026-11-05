# Client portal progress, EOD reports, correspondence — plan

Drafted 2026-11-04. Nothing built yet. Builds **on top of `multitenancy/phase-6`**, not `main`.

Boss's request:
1. Clients can log in and see the progress per day.
2. Users/VAs start and end their EOD (end-of-day) reports based on the tasks assigned to them.
3. Upload correspondence (emails, screenshots, etc.) to applications or tasks.

---

## 0. Where the branches stand (2026-11-04)

| | |
|---|---|
| `origin/main` (prod) | 18 commits not in phase-6, all since 2026-10-09 (`ea3d0a1`, the last main → phase-6 merge) |
| `multitenancy/phase-6` (local) | 82 commits not on main; 3 commits ahead of `origin/multitenancy/phase-6` (billing plan docs) |
| local `main` | 3 behind `origin/main` (fast-forward only, nothing local-only) |
| `activity-monitoring` | off main, 4 own commits, 5 behind main, not merged |

**On main, missing from phase-6:**
- Caregiver visits: Today page, per-visit checklist, notes, schedule, concerns (`VisitShift`, `VisitInstructionCheck`, `CareIncident`, new columns on `TimeEntry`).
- Time page rework (breaks, edit time, daily totals, midnight-crossing shifts).
- Clients filters + invoice/payment export; invoice emails to several addresses; invoice-line fix.
- Login activity + dev-only mobile block (`LoginEvent`, `User.mobileLoginBlocked`).
- Payroll + per-person payroll files (`PayPeriod`, `PayrollPayment`, `PayrollAttachment`).
- 3 migrations: `20261016120000_caregiver_visits`, `20261102120000_login_activity`, `20261103120000_payroll`.

**On phase-6, missing from main:** everything multitenancy (orgs, tenant DB client, per-org uniques/counters/picklists/storage, integrations, branding, invites/reset, platform console, RLS, superadmin §1–2), task time tracking (`TaskTimeEntry`), billing plan docs. 288 files, ~15k lines.

**Files changed on both sides (merge conflicts likely): 25**, notably `prisma/schema.prisma`, `src/auth.ts`, `src/lib/rbac.ts`, `src/lib/actions/{auth,clients,invoices,reports,time-entries,care-recipients}.ts`, `src/lib/time-entries.ts`, `src/lib/email.ts`, `src/lib/notifications.ts`, `src/app/(dashboard)/{layout,page,time/page}.tsx`, sidebar, product tour, handbook.

**What the main → phase-6 merge has to add** (main's new tables don't know about orgs):
- `organizationId @default(dbgenerated("current_org_id()"))` + index + `ensure_tenant_policies()` + same-org FK triggers on: `visit_shifts`, `visit_instruction_checks`, `care_incidents`, `login_events`, `pay_periods`, `payroll_payments`, `payroll_attachments`. Backfill = `org_ctk`.
- `pay_periods @@unique([startDate, endDate])` → `[organizationId, startDate, endDate]`.
- Payroll attachment storage keys → org-prefixed (phase 3c), plus a key-move for files already in prod.
- Login events: record the org; support (`isSupport`) sign-ins logged or skipped deliberately.
- New queries in main's code switched to the tenant `db` client; reports/exports stamped with workspace + tz.
- Hand-written migration (Prisma's diffs were wrong before), local rehearsal (main schema + seeds → merged), `TEST_RLS=1` suite.

## Phase A — bring phase-6 up to date (prerequisite)

1. Fast-forward local `main` to `origin/main`.
2. Branch `merge/main-into-phase6` off `multitenancy/phase-6`, merge `origin/main`, resolve the 25 files, tenantize main's 7 tables (list above).
3. Local rehearsal like 2026-10-12: scratch DB at prod's schema + seeds → migrate deploy → no rows lost, every `organizationId = org_ctk`, `migrate diff` empty. Tests normal + `TEST_RLS=1`.
4. With the user's go: merge into `multitenancy/phase-6`.
5. Branch `feature/portal-eod` off phase-6 for everything below.

`activity-monitoring` stays separate; it follows its own "Phase 6 multitenancy note" when it lands.

**Shipping:** none of this reaches prod until phase-6 rolls out (dev → rehearsal → main). See decision D1.

---

## Phase B — Correspondence (feature 3)

Built first because the EOD report and the client portal both show it.

**Model** — new `Correspondence` (tenant table):
- `organizationId`, `applicationId?`, `taskId?`, `clientId` (always set; derived from the application/task so the portal can filter on it), `clientServiceId?`
- `kind`: `EMAIL | SCREENSHOT | LETTER | PHONE_CALL | PORTAL_MESSAGE | OTHER`
- `direction`: `INBOUND | OUTBOUND | INTERNAL`
- `subject`, `fromParty`, `toParty`, `occurredAt` (when it was sent/received, not uploaded), `body` (text; email body or a typed summary)
- `clientVisible Boolean @default(false)`
- `createdById`, `createdAt`, `updatedAt`
- Attachments: `FileAsset.correspondenceId?` (reuse files, storage, versions, viewer). At least one parent (application or task) required — DB CHECK.

**Upload UX** — "Correspondence" tab on an application and section on the task panel:
- Drag-drop or pick files; **paste a screenshot** (Ctrl+V) straight into the dialog.
- **`.eml` upload** parsed server-side (`mailparser`): fills subject/from/to/date/body, its attachments become `FileAsset`s. **`.msg`** (Outlook) via `@kenjiuno/msgreader`, same result.
- Timeline list (newest first): icon by kind, subject, parties, date, attachment thumbnails, "Shared with client" badge.
- Edit/delete: creator + ADMIN/MANAGER; audited.

**Access:** same as the parent (`assertApplicationAccess` / `assertCanAccessTask`). Storage keys org-prefixed. Same upload size limits as files.

**Later (not this round):** forward-to-address inbound email (`<app-code>@in.<root>`) — needs an inbound email provider/webhook; see D6.

---

## Phase C — EOD reports (feature 2)

**Who:** every role except `CLIENT` and `CAREGIVER` (caregivers already have visit notes). Per-person switch "EOD required" (`User.eodRequired`, default on for STAFF) controls reminders and the "missing" list — not who *can* write one.

**Models** (tenant tables):
- `EodReport`: `organizationId`, `userId`, `reportDate @db.Date` (in the user's timezone, fallback org timezone), `status DRAFT | SUBMITTED`, `startedAt`, `submittedAt`, `summary?`, `blockers?`, `tomorrowPlan?`, `@@unique([userId, reportDate])`.
- `EodReportItem`: `reportId`, `taskId?` (null = ad-hoc work not on a task), `applicationId?`, `clientId?` (copied from the task for filtering), `statusBefore`, `statusAfter` (`TaskStatus`), `workDone` (text), `internalNote?`, `minutes?`, `clientVisible`, `sortOrder`.
- `EodReportComment` (manager feedback): `reportId`, `authorId`, `body`.
- Correspondence links: `EodReportItem` ↔ `Correspondence` (many-to-many) so a line can point at "sent the follow-up email".

**Start / end flow** (`/eod`, plus a card on the dashboard):
1. **Start day** — creates today's DRAFT, pre-filled with:
   - tasks assigned to the user (`TaskAssignee`) that are open (not COMPLETED/CLOSED/NA), sorted by due date/priority;
   - tasks the user logged time on today (`TaskTimeEntry`) even if not assigned — minutes pre-filled from the timer.
   Optionally tied to clock-in (D3).
2. **During the day** — add/remove lines, add an ad-hoc line, attach correspondence, autosave.
3. **End day** — per line: work done (required for lines kept), new task status (applied to the task on submit and audited), minutes; then summary, blockers, plan for tomorrow → **Submit**. Prompted at clock-out (D3). Submitted reports are locked; the author can reopen until midnight, managers any time (audited).

**Manager view** (`/eod/team`, ADMIN/MANAGER/OWNER): date picker, one row per person (submitted / draft / missing), expand to read, comment, filter by client. Export (xlsx, exceljs, stamped with workspace + tz).

**Reminders:** in-app + email to people with `eodRequired` who have no submitted report by X pm org time (D4), using the existing notifications/email (org sender).

---

## Phase D — Shareable application page (feature 1) — replaces the client portal

**Decided 2026-11-05:** no client logins/portal for licensing clients. Instead each application gets a **share link**: a read-only progress page anyone with the link can open, no account needed. (The old "portal per client" design is dropped. General-task clients get their own workspace instead: `docs/workspace-tasks-plan.md`.)

**Model** — `ApplicationShareLink` (tenant table): `organizationId`, `applicationId`, `tokenHash` (SHA-256 of a 32-byte random token; raw token only in the URL), `createdById`, `createdAt`, `expiresAt?`, `revokedAt?`, `lastViewedAt?`, `viewCount`. One active link per application (regenerate = revoke old + new).

**Staff side** — "Share" button on the application page (ADMIN/MANAGER/OWNER + the application's owner/manager):
- Create link, copy, email it to the client's contacts (existing email, org sender), set/clear expiry, regenerate, revoke.
- Shows last viewed + view count. Every create/revoke/view audited.

**Public page** — `<slug>.<root>/share/a/<token>`, no login, `noindex`, org branding (name/logo/colors):
- Header: client name, application/license type, current stage, last updated.
- Pipeline progress diagram (reuse `pipeline-diagram.tsx`) + stage timeline from `StageHistory` with dates.
- **Daily progress**: week view by day (same layout as the workspace weekly summary) built from client-visible EOD lines (Phase C) and client-visible correspondence (Phase B).
- **Tasks (view only, decided D8)**: the application's tasks grouped by phase — title, status, due date, completed date, subtasks; no assignees' hours, notes, comments or files; no actions of any kind.
- "What we need from you": open checklist items / tasks flagged as waiting on client (`WAITING_CLIENT_DOCS` stage role).
- Never shown: files, internal notes, hours, credentials, invoices.

**Security:** token unguessable + hashed at rest; revoked/expired → generic "link no longer active" page; per-IP rate limit on `/share/*`; resolve org from host, look up by token hash with the system client, then read as that tenant; tests that a token for org A never shows org B data and internal fields never reach the page payload.

**Retire `/portal` + `CLIENT` role (decided D9)**: once share links ship — check prod for CLIENT users/AccessGrants first, tell CTK, then remove `(portal)` routes, portal components, client branches in `rbac.ts`/`assertApplicationAccess`, AccessGrant UI; drop `access_grants` + convert/deactivate CLIENT users in a later migration (enum value kept until no rows use it). Note: client workspaces (docs/workspace-tasks-plan.md) use OWNER + their own client users — check that plan still has a role for a client company's extra users before dropping `CLIENT` from the enum.

## Cross-cutting

- Every new table: `organizationId` default `current_org_id()`, index, `ensure_tenant_policies()`, same-org triggers; uniques per org; added to org export/delete (phase 5) and seed/template where relevant.
- Audit log entries for create/edit/delete/submit/share.
- Superadmin entering a workspace sees it all (normal OWNER powers).
- Tests: access (client A can't see client B; STAFF can't read others' drafts; internal notes never in portal payloads), RLS suite, EOD date in different timezones.
- Handbook + product tour updated.

## Order and rough size

| Phase | Content | Size |
|---|---|---|
| A | main → phase-6 merge + tenantize 7 tables + rehearsal | 1–2 days |
| B | Correspondence | 2–3 days |
| C | EOD reports | 3–4 days |
| D | Shareable application page | 2 days |

Each phase its own commits on `feature/portal-eod`; nothing pushed or merged without the user's go.

## Decisions (all made 2026-11-05)

- **D1.** Decided: roll out phase-6 first; these features ship after it.
- **D2.** Dropped — no portal users (2026-11-05).
- **D3.** Decided: prompt to start the EOD at clock-in and to submit at clock-out; never blocks clocking.
- **D4.** Decided: reminder at 6 pm workspace time to people with no submitted EOD; managers/admins get the missing list.
- **D5.** Decided: only lines/correspondence marked "share with client"; default on for EOD lines on a client's task, off for correspondence; no hours unless an org setting turns it on.
- **D6.** Decided: inbound email later; `.eml`/`.msg` upload + paste-screenshot for now.
- **D7.** Decided: VAs are STAFF (MANAGER/ADMIN can write EODs too); no new role.
- **D8.** Decided: progression + application tasks, view only; no files.
- **D9.** Decided: retire `/portal` + CLIENT portal access after share links ship.
- **D10.** Decided: plain link (unguessable, revocable, optional expiry).
