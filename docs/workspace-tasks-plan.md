# Workspace tasks, multi-workspace staff, client weekly summary — plan

Drafted 2026-11-05. Nothing built yet. Builds **on top of `multitenancy/phase-6`** (after `merge/main-into-phase6` lands there), not `main`.

Request (user, 2026-11-05):
1. A general task manager, **separate from the licensing tasks** (applications, phases, checklists). Tasks live inside **projects**.
2. Built on multitenancy: each client company gets its own workspace with a client/owner account.
3. We (the managing company) assign our users to those workspaces. A user can work in **several workspaces** and switches between them.
4. Clients see the tasks, and a **pretty day-by-day summary for each week** of what was done, any week, any time.

---

## 0. How this fits what exists

| Existing | Relation |
|---|---|
| `Task`, `TaskAssignee`, `/tasks`, `/projects` | Licensing tasks. `Project` today is only the client tag pill on the Clients list — **not reused**. New tables below; licensing pages don't change. |
| `TaskTimeEntry` (Everhour-style timer) | Reused: gets a nullable `workTaskId`, so the same timer works on new tasks. |
| `FileAsset`, storage, viewer | Reused: nullable `workTaskId`. Org-prefixed keys as usual. |
| Support access (`src/lib/support-access.ts`) | The pattern for switching workspaces: per-workspace `User` row + single-use login link. Generalized below. |
| Multitenancy decision "one org per user, no Membership table" | **Changes** for assigned staff only — done as linked per-workspace accounts, not a Membership table, so `User.organizationId`, RLS and every FK stay as they are. |
| `docs/client-portal-eod-plan.md` | Overlaps. Its Phase D (portal inside CTK's workspace) assumed clients are `Client` rows; this plan gives each client company its **own** workspace. Phase B (correspondence) and C (EOD) still apply and can attach to work tasks. See decision W1. |

---

## Phase 1 — Assigned staff + workspace switcher (cross-workspace)

**Done 2026-11-05 on `feature/workspace-tasks`** (not pushed). Migration `20261105120000_workspace_assignments`; logic in `src/lib/workspace-assignments.ts` + `src/lib/workspace-switch.ts`; tests `tests/workspace-assignments.test.ts`. As built:
- `Organization.managedByOrgId` (not an `isManaging` flag) says which company manages a workspace; `kind FULL | TASKS`. Set in the platform console (create dialog + per-row "Setup").
- Managing side: **Client workspaces** page (`/client-workspaces`, sidebar link only for admins / account managers).
- Client side: assigned people show in Admin → Users labeled "From <company>", no edit / reset / rate.
- Switcher in the sidebar header; `/switch/enter` auto-submits the one-time link. **Only works with workspace addresses on (`ROOT_DOMAIN`)** — in single-tenant mode the switcher is hidden and the page says so.
- Tasks-only workspaces: proxy sends any non-tasks page to `/work` (placeholder until Phase 2); sidebar = Projects / Settings / Users.
- Verified over HTTP on a scratch DB with `ROOT_DOMAIN=localhost`: home sign-in → switch → linked session; link single-use; sessions don't cross hosts; linked account can't use a password; licensing pages redirect.
- Not run: `TEST_RLS=1` suite (Docker was off). Local dev DB `hclm` can't apply main's `20261016120000_caregiver_visits` (old local test data: cross-org `pipeline_stages.createdById`) — unrelated, fix by hand or recreate.

### Model
- **Managing workspace**: **CTK** (decided 2026-11-05). `Organization.isManaging Boolean` (set by superadmin).
- **Client workspaces**: `Organization.kind` = `FULL` (today's CRM) | `TASKS` (tasks-only: projects, tasks, summary, users, settings — every licensing/CRM page hidden). See W2.
- **`WorkspaceAssignment`** — platform table (not tenant; read/written with the system client only, RLS policy allows nothing to `hclm_app`):
  `id, homeOrgId, homeUserId, orgId, userId (linked account in orgId), role, canAssign, active, assignedById, createdAt, endedAt`, unique `(homeUserId, orgId)`.
- **Linked account** in the client workspace: a normal `User` row with `assignedFromUserId` (+ `isAssigned`). Like support accounts: **no password sign-in**, only via a switch link; shown in the client's user list labeled "from <managing company>"; **not counted for tenant billing** (decided W5).

### Assigning
- Who (decided W3): **CTK OWNER/ADMIN/DEVELOPER** assign anyone to any client workspace, from CTK's Admin → "Client workspaces".
- **Account managers**: a CTK admin can make a CTK user the account manager of one or more client workspaces (`WorkspaceAssignment.canAssign = true`, linked account role MANAGER). An account manager can then assign/unassign VAs **to the workspaces they manage only**, from the same page (they see just those).
- Pick user(s) from the managing workspace → role in the client workspace (STAFF default, MANAGER for leads) → creates/reactivates the linked account + assignment; audited in both workspaces' logs.
- Unassign = deactivate linked account (history and authorship kept). Deactivating the home user ends all of their assignments.
- Client owner/users can see who is assigned but **can't add or remove** managing-company staff (decided W3) — they ask CTK.

### Switching
- Header **workspace switcher** (top of sidebar): home workspace + every active assignment, current one ticked; keyboard `Ctrl+K` "Switch workspace".
- Click → server action (system client): checks home user + assignment active → issues a single-use `WORKSPACE_SWITCH` token for the linked user in the target org → redirect to `<slug>.<root>/switch/enter?token=…` → new credentials provider signs in, session carries `homeOrgSlug`/`homeUserId`.
- Each subdomain keeps its own session; switching back is the same flow in reverse (or the existing session if still alive).
- Every session refresh of a linked account re-checks the assignment is active (system query, cached briefly) — unassigning kicks the user out within a minute.
- MFA: enforced at home sign-in; switch links inherit it (link only issuable from an MFA'd session if the home user has MFA).

### Later (not v1)
- **"My work" across workspaces** in the home workspace: one list of my open tasks in every assigned workspace (system query over assignments → per-org tenant queries). Phase 5.

---

## Phase 2 — Projects and tasks

**Done 2026-11-06 on `feature/workspace-tasks`** (not pushed). Migration `20261106120000_work_projects`; rules in `src/lib/work.ts` (`workScope`), reads in `src/lib/work-data.ts`, changes in `src/lib/work-service.ts`, actions in `src/lib/actions/work.ts`; pages under `src/app/(dashboard)/work`; tests `tests/work-projects.test.ts`. As built:
- **Sides:** in a TASKS workspace, linked accounts (and platform support) are the team; every other account, the client's OWNER included, is the client side. In a FULL workspace, CLIENT users are the client side (they're still sent to /portal for now) and caregivers have no access.
- **Clients** see client-visible projects (not archived) and tasks, CLIENT comments, client-visible activity and the task's files; never hours. They comment (always client-visible), attach files, and request tasks.
- **Notifications:** assigned, new comment (internal notes only to the team), new client request (project lead, else the team's managers), request declined.
- **Timer:** "Start timer" on a task runs the regular task timer against it (`TaskTimeEntry.workTaskId`). In TASKS workspaces there's no shift clock and no auto clock-in (shifts and payroll belong to the home workspace); clients see no clock or timer.
- **Not in v1:** drag reorder in the List view (the Board reorders), @mentions, "due tomorrow" reminders, rich-text descriptions (plain text), per-file client visibility.
- **Open question:** VA hours timed in a client's workspace live in that workspace, not CTK's payroll — decide how they reach payroll (Phase 3 or 5).

New tenant tables (all `organizationId` default `current_org_id()`, index, `ensure_tenant_policies()`, same-org FK triggers, export/delete coverage):

- **`WorkProject`**: `name, description, color, status (ACTIVE | ON_HOLD | DONE | ARCHIVED), clientVisible (default true), leadId?, startDate?, dueDate?, sortOrder, createdById`.
- **`WorkTask`**: `projectId, parentId? (subtasks), title, description (rich text), status, priority, startDate?, dueDate?, completedAt?, completedById?, sortOrder, clientVisible (default = project's), estimateHours?, createdById`.
  - Own status enum `WorkTaskStatus`: `TODO | IN_PROGRESS | IN_REVIEW | BLOCKED | DONE | CANCELLED` (not `TaskStatus`, keeps it detached). W6.
- **`WorkTaskAssignee`** `(taskId, userId)`.
- **`WorkTaskComment`**: `taskId, authorId, body, visibility (INTERNAL | CLIENT)`, edit/delete by author.
- **`WorkTaskActivity`** (append-only, feeds the summary): `taskId, projectId, actorId, kind (CREATED | STATUS_CHANGED | COMPLETED | REOPENED | ASSIGNED | COMMENTED | FILE_ADDED | DUE_CHANGED), from?, to?, clientVisible, occurredAt`.
- `FileAsset.workTaskId?`, `TaskTimeEntry.workTaskId?` (DB CHECK: not both `taskId` and `workTaskId`).

### UI (`/work`, sidebar "Projects" in TASKS workspaces; "Work" in FULL workspaces)
- **Projects list**: cards with progress bar (done / total), open count, overdue, last activity, assignee avatars.
- **Project page**: **List** (grouped by status, inline add, drag reorder) and **Board** (kanban by status; reuse `tasks-kanban-board.tsx` patterns, dnd-kit). Filters: assignee, status, due, priority. Activity tab.
- **Task panel** (side sheet): title, description, status, priority, dates, assignees, subtasks, files (drag/paste), comments with Internal/Client toggle, timer, activity.
- **Task requests** (W4): clients click "Request a task" (title, details, files, wanted-by date) → lands in the project as TODO with a "Client request" badge, notifies the workspace's account manager; the client sees its status like any task. Managers can decline with a reason (status CANCELLED, reason shown to the client).
- **My tasks** (`/work/my`): assigned to me in this workspace, by due date.
- Notifications (existing system): assigned, mentioned, comment on my task, due tomorrow; email per user setting.

### Permissions (within a workspace)
| Role | Projects | Tasks | Internal comments |
|---|---|---|---|
| OWNER / ADMIN / MANAGER (incl. linked) | create/edit/archive | all | see + write |
| STAFF (incl. linked VAs) | view | create, edit, complete | see + write |
| Client OWNER / CLIENT users | view client-visible | view; comment (client-visible); **request task** (decided W4) | **never** |

One helper `workScope(session)` used by every query; tests that internal comments and non-client-visible tasks never reach a CLIENT payload.

---

## Phase 3 — Client view + weekly summary

### Client home (`/work/summary`, landing page for OWNER/CLIENT in TASKS workspaces)
- **Week view** (Mon–Sun in the workspace timezone), prev/next week + date picker; any past week, kept forever.
- **Week header**: tasks completed, tasks started, comments, files shared, hours (only when the workspace setting "Show hours to client" is on — **off by default**, decided W7; CTK admins/account manager toggle it) — with small sparkline per day.
- **7 day cards** (empty days greyed): each card shows
  - headline line ("5 tasks completed · 2 in progress on Website redesign, Payroll setup");
  - **completed** tasks grouped by project (title, who, time of day);
  - **progressed** tasks (status moves, e.g. Todo → In review);
  - client-visible comments and files added;
  - the day's written note (below), if any.
- Click a day → full-width day detail; click a task → read-only task panel.
- **Print / PDF** of a week (print stylesheet) and **"Weekly email"**: Monday morning digest of last week to OWNER/CLIENT users (per-workspace setting, on by default for TASKS workspaces). Uses existing email + org sender.

### Where the summary comes from
- Computed on read from `WorkTaskActivity` + comments + files where `clientVisible` — always current; past days don't drift because activity is append-only.
- **`DailySummaryNote`** `(organizationId, date, body, source AI | HUMAN | EDITED, authorId?, updatedAt)`, unique `(organizationId, date)`: optional short narrative written by the assigned lead ("Finished vendor onboarding, waiting on bank docs"). Shown on top of the day card.
- **AI daily summary — on by default (decided W8):** after each day ends (workspace timezone, e.g. 7 pm, or on first view of a past day), the Claude API writes a short narrative from that day's **client-visible** activity only (task titles, status moves, client-visible comments; never internal comments, hours unless shown, or file contents). Stored as `DailySummaryNote` with `source = AI`, shown on the day card, plus a weekly paragraph for the week header and the Monday email.
  - Account manager / lead can edit it (then `source = EDITED`, AI won't overwrite) or regenerate.
  - Workspace setting to turn it off. Platform-wide `ANTHROPIC_API_KEY` (not per-tenant). Retries + falls back to the plain list if the API fails. Cost tiny (one short call per workspace per day).
  - Needs: data-processing wording in ToS/BAA (Anthropic as subprocessor) before client data goes out — part of the pending legal decision.

---

## Phase 4 — Onboarding a client workspace
- Superadmin create wizard (platform console §4) gains **Type: Tasks-only** and **Assign staff** steps; template = a starter project ("Getting started") instead of the licensing template.
- Owner invite as today; first sign-in lands on the weekly summary (empty-state explains it).
- Handbook + product tour: tasks-only tour for clients; switcher step for assigned staff.

## Phase 5 — Later
- "My work" across all assigned workspaces (above).
- EOD reports (portal plan Phase C) list work tasks too; a submitted EOD line feeds the day card.
- Recurring tasks, task templates per project, client task requests approval queue.

---

## Cross-cutting
- Hand-written migrations; local rehearsal on main-schema copy; `TEST_RLS=1` suite.
- `WorkspaceAssignment` is the only cross-org table: system client only; unit tests that the app role can't read it and that a linked account can't reach another org's rows.
- Audit: assign/unassign, switch (both workspaces), project/task create/edit/delete, visibility changes.
- Superadmin entering a workspace (support access) unchanged.
- Workspace timezone for "day" boundaries; tests across DST and a non-US zone.

## Order and rough size

| Phase | Content | Size |
|---|---|---|
| 1 | Assignments, linked accounts, switcher, TASKS workspace kind | 3–4 days |
| 2 | Projects, tasks, board, comments, files, timer, activity | 4–5 days |
| 3 | Client weekly summary, day notes, print, weekly email | 3 days |
| 4 | Onboarding wizard, tour, handbook | 1–2 days |
| 5 | Later items | — |

Branch `feature/workspace-tasks` off phase-6; each phase its own commits; nothing pushed or merged without the user's go. Ships when phase-6 is in prod.

## Decisions

Made 2026-11-05:
- **W3.** Managing company = CTK. Only CTK OWNER/ADMIN/DEVELOPER assign staff; they can name account managers who assign VAs to their own client workspaces. Clients can't remove a VA.
- **W4.** Clients view, comment, and request new tasks.
- **W5.** Assigned staff don't count toward a client workspace's users.
- **W7.** Hours hidden from clients by default; per-workspace switch.
- **W8.** AI daily/weekly summary on by default (editable, can be turned off).
- **W1.** Portal-plan Phase D dropped; licensing clients get a per-application share link instead (see docs/client-portal-eod-plan.md Phase D).
- **W2.** Licensing CRM is CTK's only. Every client workspace is `kind = TASKS` (projects, tasks, summary, users, settings). The `kind` flag stays so a FULL workspace is still possible later.
- **W6.** Fixed six statuses: To do, In progress, In review, Blocked, Done, Cancelled.
- **W9.** Linked accounts are switch-only — no own password; MFA from the home sign-in.

- Other licensing consultancies as paying tenants: not decided — treated as on hold (multitenancy groundwork stays).

Still open:
- Legal: Anthropic as subprocessor in ToS/BAA (for W8).
