import { db } from "@/lib/db";
import { UserFacingError } from "@/lib/user-facing-error";
import { toDateInputValue } from "@/lib/time-entries";
import { PAYROLL_TIMEZONE, dayToDate, formatPeriod, dateToDay } from "@/lib/payroll";

// Once someone is marked paid for a period, their time in it is frozen
// (user's call, 2026-11-03): admins can't add, edit or delete it until the
// accountant uses "Undo paid" on /payroll. A person's own clock-in/out is
// never blocked — nobody gets stopped from working.
//
// A shift belongs to the day it started (clockIn) in PAYROLL_TIMEZONE —
// the same rule payroll uses to count it (src/lib/actions/payroll.ts).

export class PayrollLockedError extends UserFacingError {}

/** Calendar day an instant falls on, for payroll purposes. */
export function payrollDay(instant: Date): string {
  return toDateInputValue(instant, PAYROLL_TIMEZONE);
}

/** Paid rows whose period overlaps [fromDay, toDay]. `userId` null = anyone. */
export async function findPaidInRange(userId: string | null, fromDay: string, toDay: string) {
  return db.payrollPayment.findMany({
    where: {
      ...(userId ? { userId } : {}),
      payPeriod: { startDate: { lte: dayToDate(toDay) }, endDate: { gte: dayToDate(fromDay) } },
    },
    select: {
      userId: true,
      user: { select: { name: true } },
      payPeriod: { select: { startDate: true, endDate: true } },
    },
  });
}

function lockedMessage(rows: Awaited<ReturnType<typeof findPaidInRange>>) {
  const first = rows[0];
  const period = formatPeriod({ start: dateToDay(first.payPeriod.startDate), end: dateToDay(first.payPeriod.endDate) });
  const names = [...new Set(rows.map((r) => r.user.name))];
  const who = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  return `${period} is already paid for ${who} — undo the payment on Payroll first`;
}

/** Throws if any of `instants` (shift/break starts) falls in a paid period for `userId`. */
export async function assertTimeNotLocked(userId: string, instants: Date[]) {
  const days = [...new Set(instants.map(payrollDay))].sort();
  if (days.length === 0) return;
  const rows = await findPaidInRange(userId, days[0], days[days.length - 1]);
  const hits = rows.filter((r) =>
    days.some((d) => d >= dateToDay(r.payPeriod.startDate) && d <= dateToDay(r.payPeriod.endDate))
  );
  if (hits.length > 0) throw new PayrollLockedError(lockedMessage(hits));
}

/** Throws if [fromDay, toDay] overlaps a paid period for `userId` (null = anyone). */
export async function assertRangeNotLocked(userId: string | null, fromDay: string, toDay: string) {
  const rows = await findPaidInRange(userId, fromDay, toDay);
  if (rows.length > 0) throw new PayrollLockedError(lockedMessage(rows));
}

/** Of the given shifts/breaks, which ones sit in a paid period — for hiding
 * edit/delete buttons in the timesheet. */
export async function lockedIds(items: { id: string; userId: string; start: Date }[]): Promise<string[]> {
  if (items.length === 0) return [];
  const days = items.map((i) => payrollDay(i.start)).sort();
  const rows = await findPaidInRange(null, days[0], days[days.length - 1]);
  if (rows.length === 0) return [];
  return items
    .filter((i) => {
      const day = payrollDay(i.start);
      return rows.some(
        (r) => r.userId === i.userId && day >= dateToDay(r.payPeriod.startDate) && day <= dateToDay(r.payPeriod.endDate)
      );
    })
    .map((i) => i.id);
}
