# CRM requests — Phase 2: urgent task alerts

Part of the November 2026 CRM request list. Phase 1 (workspace type names,
staff phone numbers, bulleted weekly summary) shipped 2026-11-18.

## What it does

When a workspace task (Full Operations Management System) is marked
**Urgent** — its priority changed to Urgent, or created as Urgent (including
from a template and the follow-up task made from an urgent caregiver
concern) — these people hear about it:

- everyone assigned to the task;
- the workspace's Owners, Admins and Managers.

Never the person who marked it, and never inactive, support or caregiver
accounts. Licensing (case) tasks are not included.

Each person gets:

- an in-app notification ("Task marked urgent");
- an email, unless they turned email notifications off;
- a text from the shared Carenela number, if they have a valid mobile number,
  haven't turned urgent texts off, and haven't replied STOP.

## Text opt-out

`User.smsUrgentAlerts`, on by default. People change it on Account →
Notifications ("Text me when a task is marked urgent"); admins on Edit user.
The managing company's staff work in client workspaces through linked
accounts with no number of their own, so their home account's number and
setting are used.

## Code

- `src/lib/work-urgent.ts` — who to alert and what to send (`urgentTaskAlerts`),
  and sending it (`sendUrgentTaskAlerts`; texts go out after the response).
- Hooked in `src/lib/actions/work.ts`: create task, update task (only when the
  priority changes to Urgent), create from template, care concern follow-up.
- Migration `20261118120000_urgent_task_alerts`: `NotificationType.WORK_TASK_URGENT`,
  `users.smsUrgentAlerts`.
- Tests: `tests/urgent-task-alerts.test.ts`.

## Not in this phase

Sign-in / sign-out history for client workspaces was planned here and set
aside (2026-11-18).
