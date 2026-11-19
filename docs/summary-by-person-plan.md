# Weekly summary by person

The client workspace's "This week" page (`/work/summary`) gets busy when many
people update many tasks: the day detail lists events by kind (Finished,
Updates, Moved forward, New, Comments, Files), everyone mixed together, and a
task that was moved, commented on and finished shows up in three lists.

## Decisions (2026-11-20)

1. **Hours per person are team-only.** With "Show hours to the client" on, the
   client still sees only day and week totals.
2. **The day detail opens by person.** A "By person / By type" switch keeps the
   old layout.
3. **The client's own activity is its own group** ("From {client}"), after the
   team.
4. **The "Who worked" grid is team-only.**

## Phase 1 — people in the data (`src/lib/work-summary.ts`, no migration)

- Every item carries `byId` (activity actor, comment author).
- `WeekSummary.people`: everyone with an item this week, with `side`
  (`team` | `client`, the same rule as `workScope`).
- `DaySummary.hoursBy`: tracked hours per person, only when asked for
  (`hoursByPerson`, the team's view).
- Pure grouping in `src/lib/work-summary-people.ts` (client-safe):
  `groupDayByPerson` (one row per task per person, its events merged in time
  order) and `filterDayToPerson`.
- Totals, the Monday email, the evening text and the AI notes are unchanged.

## Phase 2 — the day by person

- A card per person: initials, name, one line of counts (and hours for the
  team), then one row per task with its events in order.
- Five tasks per card, then "Show N more". Cards collapse; a day with more than
  three people starts collapsed.
- The client's people under "From {client}", last.

## Phase 3 — the week by person (team only)

- "Who worked": a person × day grid between the numbers and the day cards,
  with week totals.
- Clicking a person filters the page (numbers, day cards, day detail) to them;
  `?person=` in the link, a chip to clear it.
- Day cards show the initials of who was active.

## Phase 4 — finish

- Printing expands every card.
- Tour and staff guide; tests for the grouping.
