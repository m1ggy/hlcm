# Activity monitoring — scope v2 (2026-11-18)

Replaces the 2026-10-30 plan. That version was built on the `activity-monitoring`
branch (5 commits, never pushed) before multitenancy shipped; its full design and
phase notes are in that branch's copy of this file. This version re-scopes it for
a product with many workspaces and reuses that code.

## Goal

A desktop app (Windows + Mac) that people clock in and out with. While they are
clocked in it takes screenshots and records which app and window is in front.
Any workspace can switch it on for its own people. Each workspace's owner reviews
their own people's activity in the web app; people see (not delete) their own.

The app writes to the same `TimeEntry` / `BreakEntry` rows as the web clock, so
Hours, Time reports, timesheets and payroll keep working unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Who offers it | **Every workspace** — switched on per workspace. Off by default. |
| Who is tracked | A workspace's own people in OWNER, ADMIN, ACCOUNTANT, MANAGER, STAFF. Never CAREGIVER or CLIENT. Never a **linked account** (a managing company's staff working in a client workspace) — see below. |
| What the app captures | **Screenshots** (every 30 min, random moment, all monitors) and **app + window title** (domain on Mac). **No** keyboard/mouse activity counts, **no** "Were you working?" idle prompt. |
| Idle | **Auto clock-out after 2 hours with no keyboard or mouse input.** The app reads the OS idle time only (no counts). The entry closes at the moment input stopped, marked auto-closed, and the person is told when they come back. |
| Clock-in | **App only, per-person switch** ("App required", `User.requireDesktopClock`), set by the workspace owner once the person has the app. Web Clock in / End break are then blocked; web Clock out / Start break stay as a fallback. |
| Who views | The workspace's **OWNER**, and **DEVELOPER** (platform break-glass; every view audited). Not admins or managers. |
| Self-view | Yes, own screenshots and apps. No delete. |
| What client companies see of a managing company's staff | **Nothing** beyond what they see today (hours, task updates, weekly summary). No screenshots, no app lists. |
| Client workspaces (Full Operations Management System) | **Get a shift clock**, so they can monitor their own employees. |
| Retention | 90 days for screenshots and app detail; time entries kept. |
| Platforms | Windows and Mac in the first release, unsigned (by decision 2026-10-30). |

## Managing company and client workspaces

How accounts work today: a managing company's staff member has one **home
account** in the managing company's workspace (shift clock, hours, payroll) and a
**linked account** in each client workspace they're assigned to, where they run
the task timer on that client's tasks (`timerPlaces`, one timer at a time).

Rules this scope sets:

1. **A person is monitored once, by their employer.** The desktop app signs in to
   the home account. A managing company's VA is tracked under the managing
   company's workspace, its policy and its retention; only its owner sees it.
2. **Linked accounts are never tracked.** If a client workspace switches
   monitoring on for its own employees, the managing company's staff in it are
   excluded: no "App required" switch, not on its activity pages, and signing in
   to the desktop app with a linked account sends the person to their home
   workspace instead.
3. **Clients see nothing of it.** Screenshots taken while a VA works on client A
   can show client B's data (other monitors, email, records), so nothing crosses
   workspaces. A later option, not in this scope: a client sees hours plus apps
   used (no screenshots) for time on its own tasks.
4. **Billing:** a VA counts once, in their home workspace, for the plan's user count.

## Shift clock in client workspaces

Today a Full Operations Management System workspace only shows the shift clock
when care visits are on (`showShiftClock` in `src/app/(dashboard)/layout.tsx`).
This scope gives every such workspace the shift clock **for its own people**
(home accounts); the managing company's linked accounts keep clocking in at home
and keep using the task timer here. That brings Hours / Time for those people
into the client workspace too (see open items: which pages come with it).

## Tenant scoping (missing from the old branch)

- `organizationId` (default `current_org_id()`, same-org triggers, RLS) on
  `AgentDevice`, `ActivityInterval`, `Screenshot`, `MonitoringConsent`,
  `ProductivityRule`; queries through the tenant-scoped `db`.
- Agent access and refresh tokens carry the workspace; `/api/agent/login`
  resolves it the way web sign-in does. One installer for every workspace; the
  workspace is chosen at sign-in, not built in.
- Screenshot keys prefixed per workspace: `tenants/{orgId}/screenshots/...`.
- Per-workspace settings: monitoring on/off and the monitoring policy text.
  Retention stays 90 days for everyone for now.
- Productivity rules per workspace; "Load starter rules" per workspace.
- Desktop sign-ins recorded in `login_events` (new method/device type "desktop
  app"), so they show in the sign-in history. The mobile sign-in block doesn't apply.

## What changes from the old branch

| Old branch | v2 |
|---|---|
| Keyboard/mouse counts (`uiohook-napi`), active seconds per app | Removed |
| 15-min idle prompt, idle grace per rule | Removed; 2-hour auto clock-out instead |
| Raw / adjusted activity %, activity bias per rule | Removed; productivity % (category time) only |
| Rules: category + bias + idle grace | Rules: category only |
| OWNER/DEVELOPER of the one workspace | OWNER per workspace + DEVELOPER (audited) |
| No tenant scoping | Scoped as above |
| Linked accounts not considered | Never tracked; app refuses them |
| `agent/` tracked in the repo | `agent/` is git-ignored on main (`1629219`) — must be un-ignored, or the app moved to its own repo |
| Migration `20261030120000_activity_monitoring` | New migration with a current timestamp |

Kept as built: device-token auth, agent API (`/api/agent/*`), heartbeat
auto clock-out when the app goes offline, encrypted offline queue, screenshot
upload + signed-URL viewing with audit, Admin > Activity (team, person day view,
devices, rules), `/time/activity` self-view, `/time/app` download page, updates
from `agent-releases/`, 90-day purge, activity export, release CI
(`.github/workflows/agent-release.yml`).

## Phases

1. **Port onto main.** New branch from main; bring the old branch's code over,
   resolve conflicts (schema, time clock, layout), drop its migration and write
   a new one with tenant columns; agent tokens + login per workspace; screenshot
   key prefix; linked accounts refused; desktop sign-ins logged. Decide where
   `agent/` lives.
2. **Trim capture.** Remove activity counts, idle prompt, bias and idle grace
   from the app, API, scoring and rules UI; add the 2-hour auto clock-out.
3. **Per-workspace switch + policy.** Workspace setting to turn monitoring on,
   policy text per workspace; owner + developer viewing rules; hide everything
   when off.
4. **Shift clock in client workspaces** for their own people.
5. **Release.** Production address in `agent/config.json`, Windows + Mac builds
   from CI, first upload to `agent-releases/`, GCS lifecycle rule, test install
   on a real Windows PC and a real Mac end to end.

## Open items

- Turning monitoring on: does each workspace owner switch it on, or the platform
  console (e.g. if it becomes a paid-tier feature)?
- Shift clock in client workspaces: always on, or only once monitoring is
  switched on? And which pages come with it (Hours, Time reports, payroll)?
- Policy text from boss/legal (NY, CT, DE need written notice of electronic
  monitoring); per workspace, with a default.
- Admin manual time entries for tracked people: still allowed (marked manual)?
- Google Cloud BAA covers the bucket (accepted 2026-11-02).
