# Forms: better UX + text notifications

Drafted 2026-11-09. Covers the public intake forms (Admin → Forms), the page people fill in (`/forms/<slug>`), the Form Submissions inbox, and a new text (SMS) alert when a form is filled.

**Built 2026-11-09 on `feature/forms`** (all five phases; migration `20261109160000_forms_upgrade`; tests `tests/forms.test.ts`). Decisions: F1 staff only, F2 one shared Carenela number (`SMS_TWILIO_*` if set, else the server's existing `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` in `.env.production`, which production already has), F3 form + first name + link, F4 any time, F5 conditional questions now, F6 email copy yes. Forms moved out of Admin to a sidebar **Forms** area (`/intake`, `/intake/forms`); managers can build forms too. Texts only get through once the number is registered for business texting (A2P 10DLC or toll-free verification).

## Where things stand

**Code:** builder `src/components/admin/form-template-dialog.tsx` (one dialog), public page `src/app/forms/[slug]` + `src/components/forms/public-intake-form.tsx`, submit `src/lib/actions/public-forms.ts`, inbox `src/components/admin/form-submissions-inbox.tsx`. Models `FormTemplate`, `FormField` (8 types: short/long text, email, phone, date, dropdown, checkbox, file), `FormSubmission` (answers JSON, PENDING/REVIEWED/DISMISSED), `FormSubmissionFile`. On submit: email to the form's chosen staff/addresses, else every admin. Twilio is already wired per workspace (`src/lib/twilio.ts`, Admin → Integrations; meeting reminders use it).

**Production (checked 2026-11-09):** one form ("Sample Form", 3 fields), 1 submission (dismissed). No workspace has Twilio connected; no user has a phone number saved. So there's no data to migrate and nothing live to break — but texting needs setup before it can work (see Phase 5).

### Problems found

Bugs:
- **Error messages vanish in production.** `submitForm` and `updateFormTemplate` throw plain `Error`s, which Next redacts in production: a visitor hitting the rate limit or a bad file type, or an admin typing a bad email, sees a generic "something went wrong". Should use `UserFacingError` / `toActionResult` like the rest of the app.
- **Answers disappear from the inbox** when a field is later removed or renamed: the inbox only shows the template's *current* fields.
- **Long answers are cut off** in the inbox (single-line truncate) with no way to read them except hovering.
- File limit says 20MB on the form but the app limit is 200MB elsewhere; pick one and say it on the form.
- 5 submissions per hour per IP: an office sharing one connection can get blocked.

Builder:
- Everything in one cramped dialog; no preview of what the visitor sees.
- Reorder with up/down arrows only; dropdown options typed comma-separated (an option can't contain a comma).
- No help text or placeholder per field, no section headings, no "duplicate field", no custom thank-you message, no way to delete or duplicate a form.
- Can't preview or test without submitting for real.

Public form:
- Errors are one toast at a time ("X is required"), not shown next to the field; nothing checks email/phone format.
- No workspace name or logo on the page — it looks generic.
- File input is the browser's raw one: one file per field, no drag-drop, no upload progress.
- Generic "Thanks — you're all set" with no way to customize it or send the person a copy.

Inbox:
- Expand-one-at-a-time list; status shown as raw "PENDING"; no search, no filter by form, no count in the sidebar.
- No in-app (bell) notification — email only.
- "Reviewed" only happens via Create client / Attach; no plain "Mark reviewed", no internal note, no CSV export.

## Plan

### Phase 1 — Fixes and groundwork (small)
- Public submit + builder actions return `{ ok, error }` (`toActionResult` + `UserFacingError`) so messages survive production.
- Store a snapshot of each field's label/type on the submission (`answers` keeps working; add `fieldsSnapshot` JSON) so old submissions always show every answer with its original label.
- Inbox shows full long answers (wrapped), status as words ("New", "Reviewed", "Dismissed").
- In-app notification `FORM_SUBMITTED` to the same recipients as the email (bell + link to the submission).
- One file limit (proposal: 25MB per file, images/PDF/Word), stated under each file field.
- Rate limit: 20 per hour per IP + honeypot (already there) + a minimum fill time (bots submit in <2s).

### Phase 2 — Builder (medium)
- Full-page editor `/admin/forms/[id]` replacing the dialog: fields list on the left, **live preview** on the right (exactly what visitors see, phone width toggle).
- Drag to reorder; duplicate field; per-field **help text** and **placeholder**; **section heading** / paragraph "fields" for long forms.
- Dropdown options as a list (add/remove/reorder rows), plus **radio buttons** and **multiple choice (checkboxes)** types.
- Form settings tab: link, active, **thank-you message**, notifications (email + text, Phase 5), "send the person a copy" toggle.
- **Duplicate form** and **delete form** (delete only with no submissions; otherwise deactivate).
- "Open form" / "Copy link" / **QR code** for printing at the office.
- Changing or removing fields is safe for past submissions (Phase 1 snapshot).

### Phase 3 — The form people fill in (medium)
- Workspace name (and logo once workspaces have one) at the top; `noindex`.
- Inline validation: errors under each field on blur and on submit, focus jumps to the first problem; email and US phone format checked (server checks too).
- Better uploads: drag-drop, several files per field, progress bar, remove before sending (reuse the new upload progress work).
- Custom thank-you message; optional "email me a copy" for the person (only answers they typed, no files).
- Mobile pass: large tap targets, right keyboard per type (`inputmode`), date picker.
- Accessibility: labels, `aria-invalid`, error summary for screen readers.

### Phase 4 — Inbox (medium)
- Table with search (any answer), filter by form and status, newest first; click opens a side panel with all answers, files, actions.
- Actions: Create client, Attach to client (existing), **Mark reviewed**, **Dismiss**, internal **note**.
- Sidebar badge with the number of new submissions.
- **Export CSV** per form (all answers, one column per field).

### Phase 5 — Text notifications (small build, setup-heavy)
- Per form, "Text these people when it's filled": pick staff (uses their phone on file) and/or extra phone numbers.
- Staff phone + opt-in in **Account → Notifications** ("Text me about new form submissions"), reusing `User.phone`; numbers stored in E.164, validated.
- Message, no personal details (submissions can hold health info, and texts aren't secure):
  `Carenela: new "Home Care Intake" submission for CTK. Review: https://ctk.carenela.com/form-submissions/abc123`
  Optional first-name-only variant if decided below.
- Sent after the submission is saved (Next `after()`), best effort: a failed text never fails the submission. Each send logged (`SmsLog`: to, form, status, Twilio SID, error) and shown on the submission ("Texted Ada, Mo").
- Twilio replies to STOP automatically; we mark the number opted out on the webhook so we stop sending.
- **Setup before it can work:** connect Twilio in Admin → Integrations for CTK, buy a number, and register it — US carriers block unregistered business texting: **A2P 10DLC** brand + campaign registration (typically 1–3 weeks, small one-time + monthly fees) or a **toll-free number verification** (usually faster). Texts cost about $0.008–0.01 each.

### Order and size

| Phase | Content | Size |
|---|---|---|
| 1 | Fixes, answer snapshot, bell notification, limits | 1 day |
| 2 | Full-page builder with preview, new field types | 2–3 days |
| 3 | Public form UX, uploads, branding | 2 days |
| 4 | Inbox table, panel, notes, export | 1–2 days |
| 5 | Text notifications + opt-out + log | 1 day (+ Twilio registration lead time) |

Phase 5 doesn't depend on 2–4; it can go right after Phase 1 so registration lead time overlaps the UX work. Start the Twilio/A2P registration now.

## Decisions needed

- **F1. Who gets texts:** only staff (proposed), or also the person who filled the form ("we got your request")? Texting the submitter needs a consent checkbox on the form and is a marketing-compliance question.
- **F2. Whose Twilio account:** each workspace connects its own (today's design; CTK registers its own number) — or one Carenela number for every workspace (we register once, pay, and could bill it later)?
- **F3. What the text says:** form name + link only (proposed), or also the person's first name?
- **F4. Quiet hours:** text any time, or hold texts overnight (e.g. 9 pm–7 am workspace time) and send in the morning?
- **F5. Conditional fields** ("show this question only if …"): in scope now, or later? Adds a day or two to Phase 2–3.
- **F6. Submitter email copy** (Phase 3): yes/no.
