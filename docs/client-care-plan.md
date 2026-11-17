# Clients and caregivers in client workspaces — plan

2026-11-17. Status: **built** on `feature/client-care` (Phases 1–3, plus generated owner passwords for new workspaces). Migration `20261117120000_client_care`.

## The ask

A client company's workspace (Organization.kind = TASKS, docs/workspace-tasks-plan.md)
today only has projects and tasks. Many of our clients are care agencies with their own
clients and caregivers. Their workspace should get something close to the full CRM's
home-care side: client records, caregiver logins, schedules, visits with clock-in,
checklists, concerns and hours.

## Decided (2026-11-17)

- **Switch per workspace**, set by a platform admin (`Organization.careEnabled`).
- **Caregivers get logins** (role `CAREGIVER`, same as the CRM). We — the company's
  admins or our assigned staff — create the accounts and **generate their passwords**;
  no invite email needed.
- **Our assigned staff (VAs) can view and edit** clients, caregivers and schedules, same
  as the company's own office people.
- **v1 = records + visits** (Phases 1–2 below). No billing or payroll.

## What already exists (full CRM)

The home-care side of the CRM is mostly separate from licensing:

| Piece | Model / code | Tied to licensing? |
|---|---|---|
| The people cared for | `CareRecipient` (`/care-recipients`) | No — `clientId` is optional |
| Caregivers | `User` with role `CAREGIVER` | No |
| Who serves whom | `CareRecipientAssignment` | No |
| Weekly schedule | `VisitShift` → caregiver's `/today` | No |
| Visit clock-in (GPS) | `TimeEntry.careRecipientId`, `src/lib/visits.ts`, `TimeClockWidget` | No |
| Visit checklist | `CareInstruction` + `VisitInstructionCheck` | No |
| Concerns | `CareIncident` (notifies managers) | No |
| Caregiver hours | `/hours` | No |
| Billing a recipient | `Invoice.careRecipientId` | **Yes** — `Invoice.clientId` required |
| Caregiver "Clients" tab | `caregiverClientScope` (Task → Application → Client) | **Yes** |
| Payroll | `/payroll` | Workspace-wide, built for CTK |

Naming: in the CRM a "Client" is a licensed business (our customer); the people a
caregiver visits are "Care recipients". For an agency's workspace, **their clients are
care recipients** — reuse `CareRecipient`, label it "Clients" there. The licensing
`Client` model stays out of TASKS workspaces.

## What blocks it today

- `src/lib/workspace-kind.ts` `TASKS_PATHS` — the proxy (`src/auth.ts:193`) sends
  `/care-recipients`, `/today`, `/hours` to `/work/summary`.
- Sidebar (`app-sidebar-nav.tsx:78`) — the TASKS branch runs before the caregiver
  branch, so a caregiver there would get the projects sidebar.
- Dashboard layout (`layout.tsx:76`) hides the shift clock in every TASKS workspace.
  That rule is for our assigned staff (their shifts belong to our workspace); the
  agency's own caregivers live in this workspace, so their clock belongs here.
- Users screen in a TASKS workspace — no `CAREGIVER` role offered; create form only has
  "invite" or a hand-typed temporary password.
- Platform has no switch for what a TASKS workspace includes.

## Plan

### Phase 1 — Clients, caregivers, logins

Data (one migration):
- `Organization.careEnabled Boolean @default(false)`.
- `User.email` becomes optional; `User.phone` unique per workspace
  (`@@unique([organizationId, phone])`, stored normalized E.164). A caregiver needs an
  email **or** a phone.

Work:
- **Platform**: `careEnabled` switch on the workspace detail page and the
  new-workspace wizard.
- **Proxy**: when `careEnabled`, also allow `/care-recipients`, `/caregivers`,
  `/today`, `/hours` (a `CARE_PATHS` list next to `TASKS_PATHS`; the proxy already
  loads the org).
- **Sidebar, TASKS branch**: "Care" group — **Clients** (`/care-recipients`, relabeled)
  and **Caregivers**, for the company's office people and our assigned team.
  Caregivers themselves get the caregiver nav (Today, My clients, My hours) with the
  licensing "Clients" tab off.
- **Caregivers page** (`/caregivers`): list of CAREGIVER users — name, phone, assigned
  clients, this week's hours, last sign-in — with **Add caregiver**.
- **Generated passwords** (permanent — not temporary, no forced change, no reset flow):
  - Add caregiver: name, phone and/or email → server generates a readable password
    (e.g. `maple-river-42`), shows it **once** in a dialog with Copy (and optionally
    "Text it to them" via the existing Twilio staff SMS).
  - Only the hash is stored; the password is never logged, emailed or audited.
  - Who can add caregivers: company OWNER/ADMIN/MANAGER and our assigned staff.
- **Phone sign-in**: the login form's field becomes "Email or phone"; `authorize`
  (`src/auth.ts:58`) looks the user up by email, or by normalized phone when the
  input isn't an email. Login throttling and login-activity keys use whichever was
  typed. Everything that emails a user (notifications, invites, forgot-password) skips
  users with no email.
- **Clients page** in a TASKS workspace: label "Clients"; hide the "Agency client"
  picker (clientId stays null), invoices and billing fields; consider dropping SSN
  from the form here.
- **Search**: include clients and caregivers; no licensing results.

### Phase 2 — Visits

- Show the shift clock for `CAREGIVER` users in TASKS workspaces (still hidden for our
  assigned staff and the company's office people — unchanged).
- Schedules (`VisitShift`), Today page, visit checklist (`CareInstruction`), report
  concern (`CareIncident`), late/missed flags, `/hours` — existing code, now reachable.
  Audit every query for hidden FULL-workspace assumptions (e.g. managers notified on a
  concern must include our assigned staff if they're the ones following up).
- Office view of visits and hours for their caregivers — reuse the existing time pages
  scoped to caregivers, or a lean "Visits" page, whichever is smaller.
- Run the caregiver e2e flow inside a TASKS workspace.

### Phase 3 — Ties to the rest of the workspace (later, optional)

- Tag a work task with a client and/or caregiver (`WorkTask.careRecipientId`,
  `WorkTask.caregiverId`, optional).
- Weekly summary (`/work/summary`): a care line — visits done/missed, open concerns.
- A concern can spawn a work task for the assigned team.

### Out of scope

- Billing their clients, payroll for their caregivers.
- Changing a workspace from TASKS to FULL.

## Things to watch

- **Pricing**: caregivers are users, and today all users count toward tier limits
  (tenant-billing decisions). A 20-caregiver agency jumps tiers. Needs a decision
  before we charge any agency.
- **Health data**: care notes, DOB, incidents are PHI and our VAs see them → BAA for
  us; the weekly AI summary must not send care details to Claude until that's settled.
- **Mobile**: caregivers are phone-first. Confirm the dev-only mobile block and the
  login-activity checks don't catch CAREGIVER in a TASKS workspace.
- **Evening text**: TASKS workspaces have a client-side evening text; caregivers must
  not get it (`src/lib/workspace-assignments.ts`).
- **Optional email**: `User.email` is non-null today and used all over (session,
  audit names, throttling, notifications, Users list, workspace switching). Making it
  nullable means a sweep of every `user.email` read — the biggest single piece of
  Phase 1.
- **Forgotten password**: no reset flow by design, and only the hash is kept, so a
  caregiver who forgets theirs needs an admin to set a new one through the existing
  edit-user screen.

## Decided later (2026-11-17)

- Caregivers without email sign in with **phone number** + password.
- Generated password is **permanent** — no forced change, no reset feature.
- Caregiver pricing: **decide later**, before charging any agency.

## Labels

"Clients" and "Caregivers" in the agency's workspace ("My Clients" for the caregiver).

## Also built: owner passwords for new workspaces

Many clients won't follow an invite link, so the platform's **New organization** dialog (and **Add owner**) can make up the owner's password instead of emailing an invite — the default. It's shown once with the sign-in address; only the hash is stored, the audit log notes that a password was made up, and the platform's Users table shows "Password given to them".
