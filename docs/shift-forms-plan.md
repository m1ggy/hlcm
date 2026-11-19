# Shift forms

Forms a caregiver fills in on their phone when they end a visit. They can't
clock out until every shift form that applies to that visit is sent.

## What the office sets

In the form builder (Settings tab), only in workspaces with clients and
caregivers turned on:

- **Shift form** checkbox. A shift form has no public link, no QR code and no
  emailed copy; the forms list labels it "Shift form".
- **Which visits:** every client's visits, or only chosen care clients
  (`form_shift_clients`).
- Several shift forms can apply to one visit. Turning a form off stops it
  applying.

## Rules

- `src/lib/shift-forms.ts`: `shiftFormsFor` (which forms apply to a care
  client), `missingShiftForms` (what this caregiver still owes for this
  visit), `assertShiftFormsDone` (throws on clock-out).
- Checked in `clockOutFor` and `endBreakForDayFor` (`src/lib/time-clock.ts`)
  whenever the open entry is a visit (has a care client). A clock-in with no
  client needs no forms. Admin time corrections on the web aren't blocked.
- A visit is its first segment (`visitStartId ?? id`), so forms filled before
  a break still count after it.
- `recordSubmission` refuses a shift form without visit details and a
  public form with them; `getPublicFormTemplate` never returns a shift form.

## Submissions

`form_submissions` gains `submittedById`, `careRecipientId`, `visitId`. The
inbox shows "Shift form from <caregiver> for the visit with <client>, started
<time>"; the office alert says "from <first name> (visit with <client>)"; the
export adds Caregiver, Care client and Visit started columns.

Migration: `20261119180000_shift_forms`. Tests: `tests/shift-forms.test.ts`.
