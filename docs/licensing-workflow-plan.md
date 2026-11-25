# Licensing workflow: services → staff → tasks → progress

Planned 2026-11-25. Source: `docs/Proposed CRM Enhancements and Recommendations.docx`
(user change requests). Section numbers below (§1–§8, II–VI) refer to that doc.

## Goal

Make the CRM work the way the doc describes:

**Client → Service → Assigned Staff → Tasks → Deliverables → Progress → Reports**

Adding a service to a client should set everything up (phases, tasks,
document checklist, folders), staff work through it step by step, and
progress, the pipeline map, the dashboard and EOD reports update from the
actual task work instead of manually moved labels.

## What we have today (no restructure needed)

The data model already has most of the chain; it just isn't wired into one
flow and has no service-level templates.

| Piece | Today |
|---|---|
| Client → services | `ClientService` (status, dates, fee), linked to a `ServiceType` |
| Service → staff | `ClientServiceAssignee` (people only, no responsibility) |
| Service → tasks | `Task.clientServiceId` (tag only, nothing generates them) |
| Licensing record | `Application`: pipeline + stage (25 CILA stages, `pipeline-stage-catalog.ts`), agency, correction rounds, deficiency dates. Optional link to a `ClientService` |
| Phases + checklist | `Phase` + `Task` on an Application, cloned from `ChecklistItemTemplate` by case type / license type when the Application is created (`checklist-clone.ts`) |
| Review | `TaskReviewer` (people only, no approve / return action) |
| Files | Folder trees per client and per Application, file versions |
| Logs, EOD | `AuditLog`, `EodReport` / `EodReportItem` linked to tasks |

The gaps: service-level templates, a guided setup, document statuses,
folder templates, a role per assignee, progress %, the stage groupings for
the dashboard, and announcements.

## Decisions (proposed)

1. **The Application stays the licensing record.** It holds the stage,
   agency and deficiency dates. Adding a *licensing* service (e.g. "CILA
   Step 1 Application Assistance") creates its Application, linked to the
   service. Non-licensing services (policy development, NPO registration…)
   get tasks directly on the service, no Application.
2. **One template system, not two.** Extend `ChecklistItemTemplate` so a
   template row can belong to a service type (not only a case type). Admins
   keep managing them in Admin → Checklist templates.
3. **Two views of where a client is, kept separate** (doc §IV timeline note):
   - *Phases* = the work (Preliminary, Phase 1 … Phase 7, from the CILA
     pathway). Driven by tasks.
   - *Pipeline stage* = where the application stands with IDHS. Moved by
     staff, as today. Finishing tasks never moves the stage by itself;
     the app may *suggest* the next stage when a phase is done.
4. **Phases are shown in order but not locked** (pending confirmation).
   The current phase is highlighted; later ones can be worked early, since
   the IDHS orientation calendar, not our paperwork, sets the pace
   (e.g. NPO sessions run alongside entity setup).
5. **Existing applications are not changed.** New fields start empty. An
   "Apply template" button can add the missing folders / tasks to an
   existing application on request.

## The step-by-step flow (doc §II)

| Step | What the user does | What the system does |
|---|---|---|
| 1. Register client | Enter intake details (or convert a lead / intake form) | Creates the client, then goes straight to step 2 |
| 2. Add service | Pick from the standard service list | Licensing service → creates the Application in the CILA pipeline at its first stage |
| 3. Assign staff | Pick VAs and a reviewer, each with a responsibility | Saves them on the service; they're the default assignees for its tasks |
| 4. Prepopulate | Review what will be created, untick anything not needed | Creates phases, tasks, document checklist and standard folders from the templates; assigns tasks by responsibility; sets due dates from offsets |
| 5. Work it | VAs update tasks / documents, upload into the matching folder; reviewers approve or return | Status history, notifications to assignee / reviewer, audit log |
| 6. Monitor | — | Service %, phase progress, pipeline map sub-activities update automatically |
| 7. Report | — | Dashboard tiles, staff workload, EOD from completed tasks |

Steps 1–4 are one guided "New engagement" flow (a multi-step dialog);
each step can also be done later from the client page, as today.

## Data changes

**Templates**
- `ChecklistItemTemplate`: `caseTypeId` becomes optional; add
  `serviceTypeId`, `kind` (`ACTIVITY` | `DOCUMENT`), `responsibility`
  (which assignee role gets it, e.g. "Application documents"),
  `folderName` (which standard folder its file goes in), `dueOffsetDays`,
  `phaseOrder` (so phases sort Preliminary → Phase 7, not alphabetically).
- `ServiceType`: add `licenseTypeTemplateId` + `caseTypeId` (set = this
  is a licensing service and creates an Application of that type),
  `description`.
- New `FolderTemplate` (name, sortOrder, parent, `serviceTypeId` or
  `licenseTypeTemplateId`). Seed the Step 1 list from doc §7 (01–10).

**Assignment**
- `ClientServiceAssignee`: add `responsibility` (text) and `isReviewer`.

**Tasks / documents** (doc §8)
- `Task`: add `kind`, `docStatus` (enum below), `requestedAt`,
  `receivedAt`, `completedAt`, `folderId` (where its file goes),
  `reviewNote`.
- `DocStatus` enum: `NOT_REQUESTED`, `REQUESTED`, `AWAITING_CLIENT`,
  `RECEIVED`, `VA_PREPARATION`, `INTERNAL_REVIEW`, `FOR_REVISION`,
  `APPROVED`, `SUBMITTED`, `COMPLETED`, `NOT_APPLICABLE`.
  Activity tasks keep the existing `TaskStatus`.

**Pipeline / dashboard** (doc §4, §IV)
- `PipelineStage`: add `group` (`STEP_1`, `STEP_2`, `LICENSE_RELEASED`,
  `POST_LICENSE`, plus `OTHER`) so the overview tiles count by group.
- `Application`: add `orientationDate` and `externalDeadline` (doc §IV:
  separate from document readiness).

**Announcements** (doc §2)
- New `Announcement` (title, body, category, urgency, deadline, pinned,
  author, archivedAt) and `AnnouncementRead` (user, readAt).

## Phases

Follows the doc's own priority list (VI). Each phase ships on its own,
is usable the day it goes live, and doesn't break anything already there.
Phases 1–4 are the core (the doc's "most important integration"); 5–7
build on them. Phase 6 (announcements) is independent and can be moved
anywhere.

### Phase 0: content and decisions (users, before any code)

Nothing to build; this unblocks Phase 1. Ask the users for:
- The full CILA pathway: Preliminary + Phases 1–7, every task, who does it
  (VA / reviewer / client), typical duration, and whether it's a document
  to collect or an activity.
- The standard service list, and for each: its tasks, whether it's a
  licensing service (creates an application) and which license type.
- Folder lists per stage (Step 1 is in §7; Step 2, issuance, post-license).
- Which pipeline stages count as Step 1 / Step 2 / Released / Post-license
  for the dashboard tiles.

And settle: phases open vs locked (recommended: open), and whether every
document needs a reviewer.

**Done when:** the content is in one spreadsheet we can import.

### Phase 1: service templates (§6, II step 4)

*Users get:* admins define, once, what each service involves.

- Migration: `ChecklistItemTemplate` gets `serviceTypeId`, `kind`,
  `responsibility`, `folderName`, `dueOffsetDays`, `phaseOrder`;
  `caseTypeId` becomes optional (a template row belongs to a case type
  *or* a service type). `ServiceType` gets `description`,
  `licenseTypeTemplateId`, `caseTypeId`.
- Admin → Service types: description, "This is a licensing service"
  (pick license type + case type).
- Admin → Checklist templates: filter and edit by service type; the new
  columns; drag to reorder phases and items.
- Import script for the Phase 0 spreadsheet (CILA templates for CTK).
- Existing application checklists keep cloning exactly as today
  (`checklist-clone.ts`); tests prove it.

**Done when:** CTK's CILA services and their tasks are set up in Admin,
and creating an application the old way behaves exactly as before.

### Phase 2: Services tab + guided "New engagement" setup (§3, II steps 1–4)

*Users get:* a Services tab in the sidebar, and client → service → staff
→ preview → everything created.

- **Services tab** (user request, 2026-11-25): a new sidebar item under
  Licensing, next to Applications and Clients, at `/services`. One list of
  every client service across all clients: client, service, status,
  team (VAs + reviewer), start date, linked application and its stage.
  Filters: service type, status, team member, "Mine". Each row opens the
  existing service page (`/clients/[id]/services/[serviceId]`). The
  "New engagement" button lives here. Staff see the services they're on;
  managers and admins see all. Progress column added in Phase 5.

- Migration: `ClientServiceAssignee` gets `responsibility`, `isReviewer`.
- Multi-step dialog: (1) client: pick an existing one or create one,
  prefilled from a lead / intake submission; (2) service; (3) team: VAs
  with responsibilities + reviewer; (4) preview: phases and tasks from
  the templates, untick what's not needed, due dates from offsets.
- Create, in one transaction: the service, its team, and either the
  Application (licensing service: pipeline + first stage + phases +
  tasks, linked to the service) or tasks on the service. Tasks are assigned
  by responsibility (template "Application documents" → the VA with that
  responsibility; none matching → the service's first VA).
- "Add service" on the client page runs steps 2–4; the old "New
  application" button stays.
- "Apply template" on an existing application: adds only the missing
  phases / tasks, never touches existing ones.

**Done when:** a new CILA client can be set up end to end in one flow and
its tasks show up in each VA's task list.

### Phase 3: document checklist + review (§8, V review / approval)

*Users get:* every requirement tracked from "requested" to "submitted",
and reviewers approve or send back.

- Migration: `Task` gets `kind`, `docStatus`, `requestedAt`,
  `receivedAt`, `completedAt`, `reviewNote`; `DocStatus` enum.
- Document tasks: status picker with the doc's 11 statuses; dates filled
  when the status moves (editable); upload from the row.
- "Checklist" tab on the application: grouped by phase, filters for
  "with the client", "waiting for review", "for revision", "missing".
- Reviewer: Approve / Return for revision (note required). Notifies the
  assignee (in-app + email). Returned → `FOR_REVISION`.
- `completedAt` set whenever a task or document is done (progress and
  reports use it).

**Done when:** a VA can work a Step 1 packet from the checklist alone,
and a reviewer can approve or return each document.

### Phase 4: standard folders (§1, §7)

*Users get:* every client's files in the same place.

- Migration: `FolderTemplate` (name, sortOrder, parent, service type or
  license type).
- Admin → Folder templates; seed Step 1 (01–10 from §7).
- Folders created with the application (Phase 2 flow and "Apply
  template"); existing folders with the same name are reused.
- Document tasks upload straight into their folder (`folderName`);
  the file list shows each file's document status (draft / for review /
  final) from its task.

**Done when:** a new CILA application starts with folders 01–10 and every
upload from the checklist lands in the right one.

### Phase 5: progress tracker (III)

*Users get:* the doc's progress card on every service.

- Shared progress calculation: completed / ongoing / pending, %, N/A
  excluded; per service, per phase, per application. Replaces the plain
  done/total bar (`task-progress.tsx`).
- Service page: the mockup card: % bar, counts, team with
  responsibilities.
- Application: progress per phase next to the pipeline stage, shown
  separately (task progress never moves the stage).
- Client page: one line per service with its %.
- Services tab: a progress column (% + done / total), sortable.

**Done when:** completing or returning a task changes the service, phase
and client progress at once.

### Phase 6: announcements (§2)

*Users get:* one official place for notices instead of group chats.

- Migration: `Announcement`, `AnnouncementRead`.
- Announcements page: post (admins / managers), category, urgency,
  deadline, pin, archive. Everyone else reads and marks as read.
- Home page: unread pinned announcements on top. Admins see who has
  read each one.
- Optional email on posting an urgent one.

**Done when:** an admin can post a pinned notice and see who's read it.

### Phase 7: pipeline map, dashboard, workload (§4, §5, V)

*Users get:* management's view of everything.

- Migration: `PipelineStage.group`; `Application.orientationDate`,
  `externalDeadline`.
- Admin → Pipelines: set each stage's group (defaults for CILA from
  Phase 0).
- Dashboard: "CILA application overview" tiles (Step 1, Step 2, License
  released, Post-license) + active clients, in progress, awaiting client,
  pending internal review, pending submission / external, completed.
  Every number opens the filtered list.
- Pipeline board: each card expands to phases and sub-activities
  (assignee, target date, status, remarks, files).
- Staff workload page: per VA: clients, services, open tasks, overdue,
  waiting for review.

**Done when:** management can answer "how many clients are at each step,
what's stuck, and who's overloaded" from the dashboard.

### Phase 8: automation (V)

- Notifications: new assignment, due in 2 days, overdue (in-app + email,
  daily digest rather than one email each).
- Recurring post-license compliance tasks (`recurrenceRule`).
- EOD: task updates already add EOD lines (`addTaskUpdateLine`); add the
  document status changes and reviewer approvals as lines too.

**Done when:** nobody has to chase due dates by hand.

### Order and dependencies

| Phase | Needs | Can ship alone |
|---|---|---|
| 0 Content | — | — |
| 1 Templates | 0 | yes (admin only) |
| 2 Services tab + guided setup | 1 | yes |
| 3 Document checklist | 1 (2 to be useful for new clients) | yes |
| 4 Folders | 2 | yes |
| 5 Progress | 3 | yes |
| 6 Announcements | — | yes, any time |
| 7 Dashboard / map / workload | 3, 5 | yes |
| 8 Automation | 3 | yes |

While waiting on Phase 0 content, Phase 6 (announcements) can be built
first, and Phase 1's code can be built and tested with sample templates.

## Content needed from the users

1. **The full CILA pathway**: every phase (Preliminary, 1–7) with its
   tasks, who normally does each, and typical durations. The doc only has
   Preliminary – Phase 5, partly filled.
2. **The standard service list** and, for each, its tasks (doc §6 table
   is a start).
3. **Folder lists** for Step 2, license issuance and post-license (Step 1
   is in §7).
4. **Which stages count as Step 1 / Step 2** for the tiles (e.g. do the
   mock / oral exam / hearing stages count as Step 1?).
5. **The document checklist** per stage (which items are required vs
   optional; doc §7 note).

## Open questions

- Phases open vs locked (decision 4): recommended open.
- Should reviewers be required on every document, or only some?
- Do clients (portal users) see their outstanding document requests?
  Not in this plan unless asked.

## Not in this plan

- Moving the pipeline stage automatically from task completion.
- Changing or migrating existing applications' tasks.
- Client-facing upload requests (could follow Phase 3).
