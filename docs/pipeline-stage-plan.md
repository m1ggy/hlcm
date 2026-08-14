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
      **Resequencing note:** the 24-file UI rewiring (kanban board, table, badges, exports,
      portal, audit log) is deferred until after Phase 2 (the stage-change engine) ships —
      cutting the old status editing UI over before there's any way to *change* a stage would
      remove the only way staff have to move a case forward. Old `status` field and its
      editing UI stay fully functional in the meantime; the new stage is tracked underneath
      but not yet user-facing. Making pipeline/stageId required + dropping `status` happens
      at the end, once the picker UI (Phase 7) replaces status-editing entirely.
- [ ] **Phase 2 — Stage-change engine.** Server action: forward moves (higher sortOrder,
      same pipeline) always allowed, whitelisted backward moves allowed, exit statuses
      allowed from anywhere, else rejected with a message. On Hold requires reason +
      follow-up date; Withdrawn requires reason. Every change writes a `StageHistory` row
      (stage, enteredAt, actor) — source of truth for "days in stage" and aging alerts.
- [ ] **Phase 3 — New case fields.** `agency`, `ballIsWith`, `correctionRound`, 3 deficiency
      dates, `assignedManagerId`. Relabel existing `assignedUserId` as "Assigned VA" in UI
      copy only.
- [ ] **Phase 4 — MCO as its own model.** `McoCredential`: clientId, mcoName (dropdown),
      stageId (MCO stages only), NPI, providerId, effectiveDate, recredentialingDueDate — N
      rows per client, rendered side by side on the client page.
- [ ] **Phase 5 — Service/project colors.** `ServiceType` lookup (mirrors
      `LicenseTypeTemplate`/`CaseType` admin pattern), hex + text color, nullable FK on
      `Project`, neutral `#ECEFF1` fallback when unset. Feeds Clients-list project badges.
- [ ] **Phase 6 — Aging alerts, no scheduler.** Compute on read from `StageHistory` +
      deficiency dates (matches existing pull-based `Notification` pattern) — dashboard
      panel + per-case flag. 6 rules from the spec (SVR>3d, WCD>14d, COR due-in-7d, Hold
      past follow-up, MCO CIR>90d, MCO recred-due-in-120d).
- [ ] **Phase 7 — Stage picker UX.** cmdk type-to-search combobox (abbrev or name,
      case-insensitive, Enter to select), inline rejection message on a disallowed move.
- [ ] **Phase 8 — Login credentials section.** Dedicated block on client/case page, separate
      from Notes — one row per portal (label, username, password, URL, last updated).

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
