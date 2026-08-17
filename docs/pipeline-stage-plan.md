# Pipeline Stage System — Plan of Attack

Source: `docs/CTK_CRM_Pipeline_Stage_Specification (1).docx`

## Why

App has one flat, hardcoded 8-value `ApplicationStatus` enum (`src/lib/status.ts`) shared by
every case regardless of license type. Spec wants three independent, admin-defined stage
lists (Home Care Licensing / CILA-Group Home / MCO Credentialing) with hex colors, hidden
sort order, abbreviation search, a locked backward-move whitelist, universal exit statuses,
and per-stage timing for aging alerts. Touches 24 files currently reading the old enum.

## Gap summary

| Doc requirement | Current state |
|---|---|
| 3 pipelines, each its own stage list | 1 global `ApplicationStatus` enum, all cases |
| Stage = abbrev + name + hidden sort + hex color | Static label/badge-variant maps, no color data |
| Backward moves whitelisted, else rejected with message | No transition rules — any status settable |
| Exit statuses (Hold/Withdrawn/Hearing Lost) from anywhere | Doesn't exist |
| "Days in stage", aging alerts | No stage-change timestamp history |
| MCO = one row per client per MCO | Application is 1 case row, no multiplicity concept |
| Service/project color pills on Clients list | `Badge` is plain outline, no color data on Project |
| Agency, Ball-is-with, correction round, deficiency dates, Assigned VA/Manager | None of these fields exist |
| Type-to-search stage picker | Plain field, no cmdk combobox |
| Separate login-credentials section (not buried in notes) | Only `Note` (freeform comment thread) |

## Decisions made

- **Credentials storage:** plain structured fields, same RBAC as the rest of the app
  (Admin/Manager/Staff) — not encrypted at rest. Revisit if this changes.
- **Status backfill:** hand-drafted mapping, reviewed with the user before it touches
  production data (see below) — not a blind reset.

## Status backfill mapping (6 real Applications, all CILA)

| Current status | License/Case | New stage | Confidence |
|---|---|---|---|
| DRAFT | CILA / New | Step I Waiting on Client Docs (`S1 WCD`) | High |
| INFO_GATHERING | CILA / Renewal | Step I Completing Application (`S1 CAP`) | High |
| SUBMITTED | CILA / Renewal | Step I Submitted to IDHS (`S1 SUB`) | High |
| UNDER_AGENCY_REVIEW | CILA / Renewal | Step I Submitted to IDHS (`S1 SUB`) | High |
| NEEDS_REVISION | CILA / Renewal | Step I Corrections Received (`S1 COR`) | High |
| APPROVED | CILA / Renewal | Step I Approved, Await Mock (`S1 APM`) | Confirmed by CTK — approved, awaiting mock |

`LicenseTypeTemplate` → `Pipeline`: CILA → `CILA_GROUP_HOME`; IDPH/IDOA → `HOME_CARE`
(Agency dropdown covers IDPH/IDoA/IDHS/Other within that one pipeline). No MCO data exists
yet, so no backfill risk there.

## Phases

- [x] **Phase 0 — Stage catalog schema.** `Pipeline` enum, `PipelineStage` model (pipeline,
      abbrev, name, sortOrder, hex, colorLabel, isExitStatus, requiresReason,
      requiresFollowUpDate, active, allowedBackwardStageIds). Seed from spec tables. Names
      locked after launch — rename is an explicit ADMIN action, not open edit like CaseType.
      Shipped: migration `20260814232450_pipeline_stage_catalog`,
      `scripts/seed-pipeline-stages.ts` (51 rows: 7 + 24 + 11 stages + 9 exit statuses,
      idempotent, backward-move whitelist wired). Run once per environment after deploy.
- [ ] **Phase 1 — Wire `Application` to real stages, retire the enum.** Add
      `pipeline`/`stageId` (nullable), backfill per mapping above, make required, drop old
      enum. Rewrite kanban board, table filters, badge→hex chip, dashboard counts, PDF/CSV
      export, portal view, audit-format labels.
      Shipped so far: migration `20260814235601_application_pipeline_stage` (adds
      `pipeline`/`stageId` to Application + `StageHistory` model, both additive/nullable),
      `scripts/backfill-application-stages.ts` (all 6 real Applications backfilled — the
      once-flagged "Prairie Path Unit 2" row is confirmed `S1 APM`, verified locally).
      `src/lib/pipeline.ts` (shared `pipelineForLicenseType` + `getInitialStage`, single
      source of truth for the script and the app) — `createApplication` now sets
      pipeline/stageId + a StageHistory row on every new case going forward, not just
      backfilled ones.
      Confirmed clean on prod: `seed-pipeline-stages.ts` + `backfill-application-stages.ts`
      run, one legacy no-license-type row ("Ace Home Care Charlotte Inc") resolved via
      `resolve-application-pipeline.ts` (HOME_CARE / WCD, derived from its existing status),
      re-run of the backfill reports zero remaining. Every real Application now has a
      pipeline + stage.
      **Resequencing note:** the 24-file UI rewiring (kanban board, table, badges, exports,
      portal, audit log) is deferred until after Phase 2 (the stage-change engine) ships —
      cutting the old status editing UI over before there's any way to *change* a stage would
      remove the only way staff have to move a case forward. Old `status` field and its
      editing UI stay fully functional in the meantime; the new stage is tracked underneath
      but not yet user-facing. Making pipeline/stageId required + dropping `status` happens
      at the end, once the picker UI (Phase 7) replaces status-editing entirely.
- [x] **Phase 2 — Stage-change engine.** Server action: forward moves (higher sortOrder,
      same pipeline) always allowed, whitelisted backward moves allowed, exit statuses
      allowed from anywhere, else rejected with a message. On Hold requires reason +
      follow-up date; Withdrawn requires reason. Every change writes a `StageHistory` row
      (stage, enteredAt, actor) — source of truth for "days in stage" and aging alerts.
      Shipped: `src/lib/stage-transitions.ts` (pure rule logic, DB-free —
      `isStructurallyReachable` for the forward/backward/exit check, `resolveStageChange`
      layers the reason/follow-up-date requirement on top), `src/lib/actions/stage.ts`
      (`changeApplicationStage` — auth, validates, transacts the Application update +
      StageHistory row, audits, notifies stakeholders; `listReachableStages` — for Phase 7's
      picker to grey out disallowed targets instead of letting someone pick one and get
      rejected). Migration `20260815010314_stage_history_reason` adds `reason`/
      `followUpDate` to StageHistory (per-transition, not per-case). Caught and fixed a real
      bug in testing: naive sortOrder comparison would've blocked *resuming* from an exit
      status (On Hold sorts last, so "resume" always looked backward) — exit statuses now
      skip the forward/backward check as both source and target. Verified with 13 cases
      against the real seeded catalog (every rule in the spec plus the cross-pipeline and
      same-stage guards), all passing.
      **Not wired to any UI yet** — no picker exists (Phase 7), and the old status field/UI
      still runs everything staff currently touch. This is backend-only, ready for Phase 7.
- [x] **Phase 3 — New case fields.** `agency`, `ballIsWith`, `correctionRound`, 3 deficiency
      dates, `assignedManagerId`. Relabel existing `assignedUserId` as "Assigned VA" in UI
      copy only.
      Shipped: migration `20260815011826_application_case_fields` (all nullable, additive).
      `updateApplicationCaseFields` action (separate from `updateApplication` — these fields
      evolve over a case's life rather than being set once, and empty string means "clear",
      distinct from an absent key meaning "leave untouched"). Wired into
      `ApplicationPropertiesTable` — Assigned Manager (filtered to MANAGER/ADMIN),
      Agency, Ball is with, Correction round, and the 3 deficiency dates. "Assigned VA"
      relabel applied everywhere "Assigned To" appeared (table header, PDF/CSV export,
      properties table) — audit log labels only, not a schema/relation rename.
      Verified live: logged in, opened a real case, confirmed all 8 new/relabeled fields
      render, edited Agency through the UI, confirmed it saved + audited correctly, then
      reverted the test edit and its audit row.
- [x] **Phase 4 — MCO as its own model.** `McoCredential`: clientId, mcoName (dropdown),
      stageId (MCO stages only), NPI, providerId, effectiveDate, recredentialingDueDate — N
      rows per client, rendered side by side on the client page.
      Shipped: migration `20260815012525_mco_credentials`. `StageHistory` made polymorphic
      (applicationId now nullable, `mcoCredentialId` added — same "exactly one set" pattern
      already used by `Note`) so MCO credentials get the same per-transition history
      Applications do. Unique on `(clientId, mcoName)` enforces the "never one row per
      client" rule at the DB level, not just in the UI.
      `src/lib/actions/mco.ts` — `listMcoCredentialsForClient`, `createMcoCredential` (sets
      initial MCO-pipeline stage via the same `getInitialStage` Phase 1 built),
      `changeMcoStage` (reuses `resolveStageChange` from Phase 2 — same engine, different
      entity), `updateMcoCredential`. New `McoCredentialsCard` on the client page — first
      real place a `PipelineStage`'s hex color renders in the actual app (a colored chip
      instead of a hardcoded badge variant), plus an Add MCO dialog filtering out MCOs the
      client already has.
      Verified live: card renders, added a real Aetna credential through the UI, confirmed
      it landed at the correct initial stage (`WCD`, colored), then deleted the test row +
      its StageHistory/audit rows.
      **Caught mid-verification:** the long-running dev server's `globalThis` Prisma
      singleton survives Fast Refresh across schema regens, so it kept using the
      pre-Phase-4 client and `prisma.mcoCredential` came back `undefined` even though
      `prisma generate` had already run. Full dev-server restart fixed it — worth remembering
      for the remaining phases, a plain file edit won't pick up a new model.
- [x] **Phase 5 — Service/project colors.** `ServiceType` lookup (mirrors
      `LicenseTypeTemplate`/`CaseType` admin pattern), hex + text color, nullable FK on
      `Project`, neutral `#ECEFF1` fallback when unset. Feeds Clients-list project badges.
      Shipped: migration `20260815013005_service_type_colors`, `scripts/seed-service-types.ts`
      (6 rows, idempotent — "Unmapped project (default)" deliberately not seeded, it's a UI
      fallback constant in `src/lib/service-type.ts`, not a selectable row). New
      `ServicePill` component (shared, colors any project pill from real hex/textColor data)
      wired into both the Clients list and Client detail "Part of" badges. `ServiceTypeSelect`
      on the Project detail page for admins to assign the color.
      Verified live: assigned CILA to a real project through the UI, confirmed the pill on
      all 3 of that project's clients rendered with the exact seeded hex (`#1565C0`/white
      text, checked via computed inline style, not just visual guess), then reverted.
- [x] **Phase 6 — Aging alerts, no scheduler.** Compute on read from `StageHistory` +
      deficiency dates (matches existing pull-based `Notification` pattern) — dashboard
      panel + per-case flag. 6 rules from the spec (SVR>3d, WCD>14d, COR due-in-7d, Hold
      past follow-up, MCO CIR>90d, MCO recred-due-in-120d).
      Shipped: `src/lib/aging-alerts.ts` (pure, DB-free — stage matching by abbrev *suffix*
      so one check covers all 3 pipelines' "SVR"/"WCD"/"COR" variants instead of 3 parallel
      lists that could drift). `src/lib/actions/alerts.ts` queries Applications and
      McoCredentials with their latest `StageHistory` row, computes days-in-stage, calls the
      pure function. New "Pipeline Alerts" card on the dashboard, warning/critical severity
      styling, links straight to the case/client.
      Verified with 15 unit cases covering every rule (including "not yet over threshold"
      and "already submitted, stop flagging" edges), then live: backdated one real case's
      `StageHistory.enteredAt` 20 days and set a 3-day-out deficiency due date on another,
      confirmed both alerts rendered correctly on the actual dashboard, reverted both (the
      backdate restored to match the original backfill's own convention —
      `enteredAt: app.updatedAt` — not just any placeholder timestamp).
- [x] **Phase 7 — Stage picker UX.** cmdk type-to-search combobox (abbrev or name,
      case-insensitive, Enter to select), inline rejection message on a disallowed move.
      Shipped: `src/components/shared/stage-picker.tsx` — every stage in the pipeline is
      listed and selectable (rule 7: a disallowed move is *rejected with a message, not
      silently accepted or hidden*), non-reachable ones just dimmed as a hint. Selecting a
      stage that `requiresReason`/`requiresFollowUpDate` switches to an inline confirm view
      instead of firing immediately. Thin wrappers (`ApplicationStagePicker`,
      `McoStagePicker`) bind it to `changeApplicationStage`/`changeMcoStage`. Wired into the
      Application properties table (new "Pipeline Stage" row, additive — old Status field
      untouched) and the MCO card (replaces the static read-only chip from Phase 4 with the
      real picker).
      Verified live end-to-end on a real case: attempted a disallowed backward move (S1 COR
      → S1 WCD), confirmed the exact rejection message rendered and the dialog stayed open;
      then a whitelisted backward move (S1 COR → S1 SUB) succeeded; then restored the case to
      its original stage and cleaned up the extra StageHistory/audit rows the test added —
      confirmed back to a single original history entry before moving on.
- [x] **Phase 8 — Login credentials section.** Dedicated block on client/case page, separate
      from Notes — one row per portal (label, username, password, URL, last updated).
      Shipped: `ClientCredential` model (plain fields, not encrypted at rest — confirmed
      choice), `src/lib/actions/client-credentials.ts` (create/update/delete/list, all
      role-gated ADMIN/MANAGER/STAFF same as the rest of a Client record). New
      `ClientCredentialsCard` renders as its own card on the client page, above the
      Notes/Audit tabs — never inside them, per the spec's explicit "won't get buried"
      requirement. Password is masked by default with a client-side eye-toggle to reveal
      (masking only, since storage itself is plain per the earlier confirmed decision).
      Fixed a design gap caught while building this: MCO credential (Phase 4) and this new
      Client credential's audit entries were being logged under their own `entityType`
      (`"McoCredential"` / `"ClientCredential"`), which `getClientAuditLog` never queries —
      making them permanently invisible in the UI. Re-targeted every call site to
      `entityType: "Client"` with distinct event actions (`add_mco`, `change_mco_stage`,
      `update_mco`, `add_credential`, `update_credential`, `remove_credential`) registered
      in `audit-format.ts` with their own sentences, so they now show up in the Client's
      existing Audit Log tab correctly.
      Verified live: added a credential through the dialog, confirmed it rendered with
      masked password, confirmed the eye-toggle revealed it, confirmed the edit dialog
      prefilled correctly, confirmed the resulting audit row landed under
      `entityType: "Client"` with the right label — then cleaned up the test credential
      and its audit rows.

## Reference tables (from spec)

### Pipeline 1: Home Care Licensing (IDPH, IDoA, IDHS, Other)

| Abbrev | Stage Name | Sort | Hex | Color |
|---|---|---|---|---|
| WCD | HC Waiting on Client Docs | 10 | #9E9E9E | Gray |
| CAP | HC Completing Application | 20 | #2196F3 | Blue |
| SVR | HC Supervisor Review | 30 | #9C27B0 | Purple |
| RTS | HC Ready to Submit | 40 | #009688 | Teal |
| SUB | HC Submitted to Agency | 50 | #FF9800 | Orange |
| COR | HC Corrections Received | 60 | #F44336 | Red |
| LRD | HC License Released | 70 | #4CAF50 | Green |

### Pipeline 2: CILA / Group Home Licensing

| Abbrev | Stage Name | Sort | Hex | Color |
|---|---|---|---|---|
| S1 WCD | Step I Waiting on Client Docs | 10 | #9E9E9E | Gray |
| S1 CAP | Step I Completing Application | 20 | #2196F3 | Blue |
| S1 SVR | Step I Supervisor Review | 30 | #9C27B0 | Purple |
| S1 RTS | Step I Ready to Submit | 40 | #009688 | Teal |
| S1 SUB | Step I Submitted to IDHS | 50 | #FF9800 | Orange |
| S1 COR | Step I Corrections Received | 60 | #F44336 | Red |
| S1 APM | Step I Approved, Await Mock | 70 | #FFB74D | Light Orange |
| CMK | CTK Internal Mock Scheduled | 80 | #2196F3 | Blue |
| WMK | Waiting for IDHS Mock | 90 | #FF9800 | Orange |
| MKF | Mock Failed, Remediation | 100 | #F44336 | Red |
| MKP | Mock Passed, Await Oral Exam | 110 | #FFB74D | Light Orange |
| COM | CTK Oral Mock Scheduled | 120 | #2196F3 | Blue |
| WOE | Waiting for IDHS Oral Exam | 130 | #FF9800 | Orange |
| OEF | Oral Failed, Remediation | 140 | #F44336 | Red |
| HRQ | Hearing Requested | 150 | #B71C1C | Dark Red |
| HRS | Hearing Scheduled | 160 | #B71C1C | Dark Red |
| HRW | Hearing Won, Resuming | 170 | #009688 | Teal |
| S2 CAP | Step II Completing Application | 180 | #2196F3 | Blue |
| S2 SVR | Step II Supervisor Review | 190 | #9C27B0 | Purple |
| S2 RTS | Step II Ready to Submit | 200 | #009688 | Teal |
| S2 SUB | Step II Submitted to IDHS | 210 | #FF9800 | Orange |
| S2 COR | Step II Corrections Received | 220 | #F44336 | Red |
| S2 ACC | Step II Accepted by IDHS | 230 | #8BC34A | Light Green |
| LRD | CILA License Released | 240 | #4CAF50 | Green |

### Pipeline 3: MCO Credentialing

One row per client per MCO, never one per client — a client credentialing with five MCOs
has five records, each moving through these stages independently.

| Abbrev | Stage Name | Sort | Hex | Color |
|---|---|---|---|---|
| WCD | MCO Waiting on Client Docs | 10 | #9E9E9E | Gray |
| CAP | MCO Completing Application | 20 | #2196F3 | Blue |
| SVR | MCO Supervisor Review | 30 | #9C27B0 | Purple |
| RTS | MCO Ready to Submit | 40 | #009688 | Teal |
| SUB | MCO Submitted | 50 | #FF9800 | Orange |
| COR | MCO Corrections / Info Requested | 60 | #F44336 | Red |
| CIR | MCO Credentialing In Review | 70 | #FFB74D | Light Orange |
| APC | MCO Approved, Contracting | 80 | #009688 | Teal |
| CSL | MCO Contract Signed, Await Load | 90 | #FFB74D | Light Orange |
| ENR | MCO Enrolled / Effective | 100 | #4CAF50 | Green |
| DEN | MCO Denied | 110 | #B71C1C | Dark Red |

MCO Denied exits back to MCO Completing Application (reapply) or to Withdrawn/Closed.

### Exit statuses (available from any stage, all pipelines)

| Abbrev | Stage Name | Sort | Hex | Color |
|---|---|---|---|---|
| HLD | On Hold | 900 | #FFC107 | Yellow |
| WDN | Withdrawn / Closed | 910 | #212121 | Black |
| HRL | Hearing Lost, Closed | 920 | #212121 | Black |

### Service / Project colors

Fill the project tag pill background on the Clients list; text color as specified. Stage
chip and project pill sit side by side and never swap roles — pill = which service, chip =
what's happening. Franchise and Virtual Assistant are tag-only (no pipeline yet). Anything
not listed gets the neutral default.

| Service / Project | Hex | Color |
|---|---|---|
| Ace Home Care Franchise | #FDD835 | Yellow, text #4A3B00 |
| CILA | #1565C0 | Blue, text white |
| Home Care | #E65100 | Orange, text white |
| Group Home | #2E7D32 | Green, text white |
| Virtual Assistant | #6A1B9A | Purple, text white |
| MCO | #C62828 | Red, text white |
| Unmapped project (default) | #ECEFF1 | Neutral, text #37474F |

### Developer rules (from spec)

1. Stage names locked after launch. Renames require admin permission — renaming orphans
   historical records.
2. Allowed backward moves only: Supervisor Review → Completing Application, Corrections
   Received → Submitted, Mock Failed → CTK Internal Mock, Oral Failed → CTK Oral Mock, MCO
   Denied → MCO Completing Application. Hearing Won moves forward to Step II Completing
   Application.
3. On Hold requires a reason and a follow-up date. Withdrawn requires a reason.
4. Timestamp every stage change to enable days-in-stage reporting.
5. Color is bound to the stage record, not entered per client.
6. Abbreviations are unique within each pipeline. Sorting always follows the hidden Sort
   number, never the abbreviation.
7. Stage dropdowns are type-to-search: abbrev or any part of the name, case-insensitive.
   Enter on a valid abbreviation selects directly. Still obeys rule 2 — a disallowed move is
   rejected with a message, not silently accepted.

### Fields on every case record

- Agency: dropdown — IDPH, IDoA, IDHS, Other
- Ball is with: CTK, Client, or Government
- Days in current stage: auto-counted from the last stage-change timestamp
- Correction round number
- Deficiency received date / response due date / response submitted date
- Assigned VA / Assigned Manager

Additional fields on MCO records only: MCO Name (dropdown — Aetna, BCBS IL, CountyCare,
Humana, Meridian, Molina, Other), NPI, Provider ID (issued at enrollment), Effective Date,
Recredentialing Due Date.

### Aging alerts

- Supervisor Review over 3 days → flag the Manager
- Waiting on Client Docs over 14 days → flag for a client follow-up call
- Corrections Received with response due within 7 days → daily flag until submitted
- On Hold past the follow-up date → flag
- MCO Credentialing In Review over 90 days → flag for a status call to the MCO rep
- MCO Recredentialing Due Date within 120 days → flag to start recredentialing

### Color reading guide

Gray: chase the client · Blue: CTK is working on it · Purple: manager is reviewing ·
Teal: ready to move forward · Orange: government has it · Light Orange: waiting for a
schedule · Red: act now · Dark Red: legal fight in progress · Light Green: accepted, final
step pending · Green: done, license released · Yellow: on hold, check the follow-up date ·
Black: closed
