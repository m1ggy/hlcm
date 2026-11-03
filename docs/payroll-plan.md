# Payroll: mark paid, attachments, user acknowledgement

Requested by the accountant (2026-11-03):

1. **Payroll Acknowledgement** — the accountant marks a pay period paid.
2. **Payroll Attachments** — the accountant adds files for a pay period.
3. **Payroll Users** — each user sees their payment and acknowledges they received it.

## Status

All four phases built on branch `feature/payroll` (2026-11-04), not merged.
Tested end to end in a throwaway DB (mark paid, mark all, no-rate error,
time lock, report problem, confirm, resolve, undo, admin view-only).
**Not tested locally: file upload/download** — no `GCS_BUCKET` in local
`.env`; try it on dev before prod.

Built differently from the plan below:
- No `wiseTransactionId` column and no `PayPeriod.note` (not needed yet).
- `amountPaid` became `grossAmount` + `netAmount`; paid date is `paidOn`.
- Pay periods use one fixed calendar zone, `PAYROLL_TIMEZONE`
  (America/Chicago, `src/lib/payroll.ts`), so a shift belongs to the same
  period for everyone. Hours on /payroll only count shifts *starting* in
  the period (the Time report counts shifts overlapping the range, so a
  shift across midnight on the 15th can differ by that shift).
- Break deduction add/remove now return errors properly (they used to
  throw, which hid the message in production).

## Decisions (2026-11-03)

| Question | Decision |
|---|---|
| Paid scope | **Per person, with "Mark all paid"**. Each person in a period gets their own paid row (hours/amount snapshot). A bulk button marks everyone; one person can still be marked late. |
| Attachment visibility | **Two kinds.** Period files (payroll register, bank confirmation) — payroll managers only. Per-person files (pay stub) — also visible to that person. |
| Who manages | **ACCOUNTANT only** (+ OWNER/DEVELOPER), same as Invoices. ADMIN/MANAGER can view paid status, not change it. |
| User actions | **"I received this"** or **"Report a problem"** (with a note). A problem notifies the accountant(s). |
| Gross vs net | **Both.** App computes gross; accountant enters net. Users see both. |
| Time after payment | **Locked.** Once a person is marked paid for a period, their time in that period can't be added, edited or deleted until "Undo paid". |

## Where things stand today

- Pay periods are not stored. They are computed on the fly as semi-monthly
  (1st–15th, 16th–end of month) by `currentPayPeriodRange` in
  `src/lib/time-entries.ts`.
- Pay is computed live: hours (after break deductions) × `User.hourlyRate`,
  via `summarizeByUser` — shown on Time → "All users" (`TimesheetReport`).
  Editing time later silently changes the "pay" number.
- `payUserViaWise` (`src/lib/actions/wise.ts`) exists and writes
  `WiseTransaction`, but no UI calls it — the accountant pays outside the app.
- Attachment pattern to copy: `InvoiceAttachment` +
  `src/lib/actions/invoice-attachments.ts` +
  `src/app/api/invoice-attachments/[id]/route.ts` (`saveUploadedFile` /
  `deleteStoredFile` from `src/lib/storage`).
- Users see their own hours on `/time` → My Time (staff) and `/hours`
  (caregivers), both via `MyTimeLog`.
- Notifications: `notify()` in `src/lib/notifications.ts` (in-app + email).

## Data model

```prisma
// One semi-monthly period (1st–15th / 16th–end). Created on first use —
// when the accountant opens it on /payroll or marks someone paid.
// Date-only columns: a period is calendar days in the account timezone,
// not instants, so no timezone drift.
model PayPeriod {
  id        String   @id @default(cuid())
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  note      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  payments    PayrollPayment[]
  attachments PayrollAttachment[]

  @@unique([startDate, endDate])
  @@map("pay_periods")
}

enum PayrollMethod {
  DIRECT_DEPOSIT
  CHECK
  WISE
  CASH
  OTHER
}

// One person's pay for one period. Exists only once they are marked paid
// (unpaid people are just rows computed from time entries). Hours/rate/
// gross are a snapshot taken at mark-paid so later time edits can't
// change what was paid.
model PayrollPayment {
  id          String    @id @default(cuid())
  payPeriodId String
  payPeriod   PayPeriod @relation(fields: [payPeriodId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("PayrollPaymentPayee", fields: [userId], references: [id])

  hours       Float
  breakHours  Float
  hourlyRate  Float?
  grossAmount Float     // hours × rate at mark-paid; accountant can adjust (bonus, no rate set)
  netAmount   Float     // take-home actually sent, entered by the accountant (prefilled with gross)
  method      PayrollMethod
  reference   String?   // check #, bank ref
  note        String?

  paidAt   DateTime    // the day the money went out (accountant picks; defaults today)
  markedById String
  markedBy   User      @relation("PayrollPaymentMarkedBy", fields: [markedById], references: [id])

  acknowledgedAt    DateTime?
  problemReportedAt DateTime?
  problemNote       String?
  problemResolvedAt DateTime?
  problemResolvedById String?
  problemResolvedBy User? @relation("PayrollPaymentProblemResolvedBy", fields: [problemResolvedById], references: [id])

  wiseTransactionId String? @unique   // set when paid through Wise (later)

  attachments PayrollAttachment[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([payPeriodId, userId])
  @@index([userId])
  @@map("payroll_payments")
}

// payrollPaymentId null  -> period file (managers only)
// payrollPaymentId set   -> that person's file (managers + that person)
model PayrollAttachment {
  id               String          @id @default(cuid())
  payPeriodId      String
  payPeriod        PayPeriod       @relation(fields: [payPeriodId], references: [id], onDelete: Cascade)
  payrollPaymentId String?
  payrollPayment   PayrollPayment? @relation(fields: [payrollPaymentId], references: [id], onDelete: Cascade)
  fileName     String
  storageKey   String
  mimeType     String
  sizeBytes    Int
  uploadedById String
  uploadedBy   User     @relation("PayrollAttachmentUploadedBy", fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())

  @@index([payPeriodId])
  @@index([payrollPaymentId])
  @@map("payroll_attachments")
}
```

New `NotificationType` values: `PAYROLL_PAID` (to the user),
`PAYROLL_PROBLEM_REPORTED` (to every active ACCOUNTANT). No notification on a
plain acknowledgement — it shows as a status instead (avoids noise).

Status per person (derived, not stored):
`Not paid` → `Paid – awaiting confirmation` → `Received` | `Problem reported` → (`Problem resolved`).

## Permissions

- `canManagePayroll(role)` in `src/lib/rbac.ts` = ACCOUNTANT or superuser
  (mirror of `canAccessInvoices`). Server actions: `requireRole(["ACCOUNTANT"])`
  (superusers pass automatically; plain ADMIN does not, since the list has no ADMIN).
- View-only for ADMIN/MANAGER: `/payroll` loads, buttons hidden, actions
  still reject.
- A user may read only their own `PayrollPayment` rows and their own
  per-person attachments. Period files never reach non-managers.
- Every change goes through `recordAudit`.

## Screens

### `/payroll` (new sidebar link for management roles)
- **Period picker**: recent periods (current + last ~12) with a badge:
  `Not paid`, `5 / 8 paid`, `Paid`, `2 awaiting confirmation`, `1 problem`.
- **People table** for the period (rows = everyone with time in range, from
  `summarizeByUser`, plus anyone already paid):
  Person · Hours · Rate · Gross · Net · Method / ref · Paid on ·
  Status · Files · actions (Mark paid / Edit / Undo paid / Resolve problem).
- **Mark all paid** dialog: paid date, method, reference, note, plus a
  table of every unpaid person with a Net input per row (prefilled with
  gross) → creates a `PayrollPayment` per row. Rows with no hourly rate
  need a gross typed in, or are skipped.
- **Mark paid** (one person): same fields + gross (prefilled) + net.
- People still on the clock with a session in the period: warned in both
  dialogs; their open session isn't counted.
- **Undo paid**: deletes the payment row (and its per-person files after a
  confirm); allowed any time, audited, clears acknowledgement, unlocks
  their time for that period.
- **Period files** card: upload / download / delete (managers only).
- Per-person files: upload from the row's menu; count shown in Files column.
- Hours changed since paid (only possible via a late clock-out, see Time
  lock): if live hours ≠ snapshot hours, show a warning icon on the row.

### Time lock
Helper `assertTimeNotLocked(userId | null, from, to)` in
`src/lib/payroll-lock.ts`: throws a `UserFacingError` ("Oct 16–31 is
already paid for Jane — undo the payment on Payroll first") when a
`PayrollPayment` exists for that user in a period overlapping the range.
`userId = null` (company-wide) checks everyone and names who's paid.

Called from every admin time change in `src/lib/actions/time-entries.ts`:
add / edit / delete time entry (old and new dates both checked), add /
edit / delete break, add / delete `TimesheetBreakDeduction`.

Not locked: a person's own clock-in/out — nobody gets stopped from
working. Only matters if a period is paid before its last day; the
"hours changed since paid" warning covers that.

UI: `TimesheetDayList` shows a lock icon on days inside a paid period and
hides edit/delete there; Add time / break deduction dialogs show the
server error.

### My Time (`/time`) and My Hours (`/hours`) — new "My Pay" card
- List of the user's `PayrollPayment` rows, newest first: period, hours,
  gross, net, paid on, method, their files (download), status.
- Buttons on unconfirmed rows: **I received this** · **Report a problem**
  (dialog with required note). After a problem is resolved by the
  accountant, the user can confirm receipt.
- Caregivers: a small banner on `/today` when a payment awaits their
  confirmation (they live on that page).

### Notifications
- Mark paid → `PAYROLL_PAID` to the user: "Your pay for Oct 16–31 was sent —
  please confirm you received it." Links to `/time` or `/hours` (add
  `ENTITY_LINKS` entry keyed by role).
- Bulk mark → one notification per person.
- Report problem → `PAYROLL_PROBLEM_REPORTED` to accountants, links to
  `/payroll?period=<id>`.

## Build phases

1. **Mark paid** — schema + migration, `src/lib/actions/payroll.ts`
   (`listPayPeriods`, `getPayPeriod`, `markPaid`, `markAllPaid`,
   `updatePayment`, `undoPaid`), `canManagePayroll`, `/payroll` page +
   sidebar link, audit entries, time lock (`assertTimeNotLocked` + lock
   icons in the timesheet).
2. **Attachments** — `src/lib/actions/payroll-attachments.ts`,
   `src/app/api/payroll-attachments/[id]/route.ts` with the visibility rule
   above, storage prefix `payroll/<periodId>/`.
3. **User view + acknowledgement** — My Pay card on `/time` and `/hours`,
   `acknowledgePayment`, `reportPaymentProblem`, `resolvePaymentProblem`,
   two notification types, `/today` banner for caregivers.
4. **Polish** — hours-changed-since-paid warning, page info buttons + handbook
   (`public/handbook.html`) section, tour step for `/payroll`.

Each phase is shippable on its own; 1 → 2 → 3 is the order the accountant
asked in.

## Open questions

- ~~Gross vs net~~ — decided 2026-11-03: both.
- ~~Lock time after paid~~ — decided 2026-11-03: lock.
- **Reminders**: nudge users who haven't confirmed after N days? Not in
  scope unless asked.
- **Wise**: if Wise payouts get a button later, a successful transfer should
  create the `PayrollPayment` automatically (`method = WISE`).
- **Pay period length** stays semi-monthly (matches `currentPayPeriodRange`).
  If they switch to biweekly, `PayPeriod` already stores explicit dates.

## Multitenancy note

When `multitenancy/phase-6` merges: add `organizationId` + RLS policies to
`pay_periods`, `payroll_payments`, `payroll_attachments`; `@@unique` on
PayPeriod becomes `[organizationId, startDate, endDate]`; storage key gets
the org prefix (phase 3c); notifications to "every accountant" scoped to
the org.
