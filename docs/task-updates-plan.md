# Task updates and check-off (plan, 2026-11-11)

**Built 2026-11-11** (decisions D1–D5 as proposed). Migration
`20261111140000_task_updates` (`EodReportItem.fromTaskUpdate`, `addedAfterSubmit`);
`postUpdate` in src/lib/work-service.ts, `addTaskUpdateLine` in src/lib/eod.ts,
src/lib/task-updates.ts (home report across workspaces), `TaskUpdateDialog` /
`TaskCheck` in src/components/work/task-update-dialog.tsx; tests
`tests/task-updates.test.ts`. Differences from the plan: editing a line that came
from updates changes the report only (the posted update stays as written); a
report line's status is applied on submit only when the report itself changed it,
so a task reopened since isn't closed again.

Staff write what they did **on the task, as they go**, and each update becomes a
line in that day's end-of-day report automatically. Every task list gets a
checkbox; ticking it asks "What did you do?" before the task is marked done.
The end-of-day report stays (summary, blockers, plan, managers' Team view), but
at 6 pm it is mostly written already.

## Today

- Task lists have no checkbox: Projects & tasks list view, My tasks, Client work,
  and the licensing My Tasks / case task lists. Status changes go through the task
  panel or the board. Subtasks in the panel already have checkboxes.
- What someone did is written only on the End of day page; on submit, lines on
  client-workspace tasks are posted to the task as a `REPORTED` activity
  (`applyWorkLine`, src/lib/work-everywhere.ts) and shown to the client.
- Gap: Start day picks up licensing tasks and client-workspace tasks, but not the
  home workspace's own Projects & tasks (`workTasksForDay` only walks linked
  workspaces).

## The update

One small form, used in two places:

- **What did you do?** (required, plain text)
- **Minutes** (optional; prefilled with today's timer time on that task)
- **Share with the client** (default on when the task is visible to the client;
  hidden on licensing tasks with no client and on internal tasks)
- **Status** (only in "Post update"; the checkbox always means Done)

Where it opens:

1. **Checkbox** on every task row and board card for the team. Ticking an open task
   opens the form; saving marks it Done and posts the update. Cancel leaves the
   task as it was. Unticking a done task reopens it (To do) without a prompt.
2. **Post update** button in the task panel: the same form, without completing.

Subtask checkboxes: the prompt is optional there (a "Skip" link), so small steps
stay one click. Clients never get checkboxes (they don't change status today).

## What an update does

1. Posts a `REPORTED` activity on the task (existing kind), client-visible when
   shared. The client sees it on the task, on This week as "Updates from the
   team", in the day's AI note and the evening text.
2. Adds a line to the person's end-of-day report for today, in their home
   workspace, creating the draft if there isn't one:
   - licensing task: `taskId` line (feeds the share page when shared, as now);
   - client-workspace task: `workOrgId`/`workTaskId` line (as now);
   - home workspace's own Projects & tasks: also `workOrgId`/`workTaskId`, with the
     home org (new; also added to Start day, closing the gap above).
   A second update on the same task the same day appends to that line's text and
   adds the minutes.
3. The line records the activity it came from (new `EodReportItem.activityId`), so
   submitting the report doesn't post it to the task again, and editing the line's
   text on the End of day page edits the posted update.
4. If today's report was already submitted, the line is added to it and marked
   "added after submitting"; managers see the mark. No second submit needed.

## End of day page

- Lines that came from task updates show a small "From the task" label.
- Everything else is unchanged: Start day still pre-fills open and timed tasks,
  ad-hoc lines still work, summary/blockers/plan, 6 pm reminder, Team view.

## Phases

1. **Work tasks**: checkbox + prompt on Projects & tasks (list, board, My tasks,
   Client work) and Post update in the panel; update → activity + EOD line;
   home-workspace work tasks in Start day. Migration: `EodReportItem.activityId`,
   `addedAfterSubmit`.
2. **Licensing tasks**: the same checkbox + prompt on My Tasks and case task lists;
   update → EOD line (no task activity kind there; the share page reads shared
   EOD lines already).
3. **Polish**: handbook + tour, "From the task" label, merge rules, tests.

## Decisions to confirm

- D1. Prompt required on top-level tasks, optional on subtasks? (proposed: yes)
- D2. Licensing tasks too (phase 2)? (proposed: yes)
- D3. Updates after submitting go into today's submitted report, marked? (proposed: yes)
- D4. "Share with the client" on by default for client-visible tasks? (proposed: yes)
- D5. Unticking reopens to To do without a prompt? (proposed: yes)
