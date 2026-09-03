// Pure helpers shared by the clock widget, the admin report, and the PDF
// export route — kept dependency-free (no prisma/server imports) so they're
// safe to use from client components too.

// Lives here rather than in the "use server" actions module — a server
// action file may only export async functions, and a stray class export
// there silently drops every export from the module (Turbopack then reports
// "module has no exports at all" for every named import from it).
export class TimeClockError extends Error {}

export function hoursBetween(clockIn: Date, clockOut: Date) {
  return Math.max(0, clockOut.getTime() - clockIn.getTime()) / 3_600_000;
}

/** "7h 32m" — used anywhere a duration is shown to a human. */
export function formatDuration(totalHours: number) {
  const totalMinutes = Math.round(totalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Company home base — the fallback for anyone who hasn't set their own
 * zone in Account settings. Everyone defaults to the same zone (rather
 * than each browser's own auto-detected one) so a self clock-in and a
 * manually-added entry land on the same wall-clock hours by default. */
export const DEFAULT_TIMEZONE = "America/Chicago";

/** The browser's own IANA zone (e.g. "America/Chicago") — kept as an
 * option for anyone who wants to explicitly set their Account timezone
 * to "wherever I am", but no longer the fallback when unset (see
 * DEFAULT_TIMEZONE). */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** `account.timezone` if set, else DEFAULT_TIMEZONE — the single place
 * every time-clock display/input resolves "which zone am I working in". */
export function effectiveTimezone(accountTimezone: string | null | undefined): string {
  return accountTimezone || DEFAULT_TIMEZONE;
}

/**
 * This instant's UTC offset in minutes for an arbitrary IANA zone, sign
 * matching `-Date#getTimezoneOffset()` (positive = ahead of UTC). Works by
 * reading the zone's wall-clock digits for `date` via Intl, then comparing
 * against those same digits reinterpreted as UTC — the gap between the two
 * is the offset. `date` matters because a zone's offset can change across a
 * DST boundary.
 */
function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  // Round to the minute — `date` (often "now") carries milliseconds that
  // don't divide evenly into 60_000, which would otherwise leave a
  // fractional-minute remainder in the result (e.g. "59.998" instead of "00").
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** "yyyy-MM-ddTHH:mm" for `date`'s wall-clock reading in `timeZone` — the
 * counterpart to `zonedInputToISOString`, used to prefill a `DateTimeInput`
 * from a stored instant (e.g. an existing entry's clockIn) in that zone. */
export function toDatetimeLocalValue(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "yyyy-MM-dd" for `date`'s wall-clock reading in `timeZone` — same idea
 * as `toDatetimeLocalValue`, for a plain `date` input. */
export function toDateInputValue(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return toDatetimeLocalValue(date, timeZone).split("T")[0];
}

/** "yyyy-MM-dd" + "HH:mm" for right now, read in `timeZone` — what the
 * "Now" button and a fresh dialog's defaults fill in. */
export function zonedNowParts(timeZone: string): { date: string; time: string } {
  const value = toDatetimeLocalValue(new Date(), timeZone);
  const [date, time] = value.split("T");
  return { date, time };
}

/**
 * Converts a `DateTimeInput`'s "yyyy-MM-ddTHH:mm" value (a plain wall-clock
 * reading, no timezone attached) into an unambiguous ISO instant, resolved
 * against `timeZone` — not wherever this code happens to execute. Call this
 * client-side (in the browser, before sending the value to a server
 * action), not server-side: passing the raw string straight to the server
 * instead would let `z.coerce.date()` parse it against the *server's*
 * timezone — silently wrong whenever server and browser/setting differ.
 *
 * Building `Date.UTC` from the typed digits gives a first guess at the
 * instant; converging on the zone's actual offset (which can itself depend
 * on the instant, across a DST boundary) takes one correction pass.
 */
export function zonedInputToISOString(value: string, timeZone: string): string {
  if (!value) return "";
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const firstOffset = offsetMinutesAt(new Date(guess), timeZone);
  let utcMs = guess - firstOffset * 60_000;
  const secondOffset = offsetMinutesAt(new Date(utcMs), timeZone);
  if (secondOffset !== firstOffset) utcMs = guess - secondOffset * 60_000;
  return new Date(utcMs).toISOString();
}

/** e.g. "America/Chicago (UTC-05:00)" — shown next to time inputs so it's
 * clear which timezone a typed time is resolved against. */
export function timezoneLabel(timeZone: string): string {
  try {
    const offsetMin = offsetMinutesAt(new Date(), timeZone);
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    return `${timeZone} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
  } catch {
    return timeZone;
  }
}

/** year/month/day of `date`'s wall-clock reading in `timeZone`, as numbers —
 * calendar math below builds on these instead of `Date`'s own (browser-local) getters. */
function zonedYMD(date: Date, timeZone: string) {
  const [datePart] = toDatetimeLocalValue(date, timeZone).split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  return { y, mo, d };
}

/** 1st–15th, or 16th–end of month, whichever contains "today" in `timeZone` — a biweekly pay period. */
export function currentPayPeriodRange(timeZone: string = DEFAULT_TIMEZONE, now = new Date()) {
  const { y, mo, d } = zonedYMD(now, timeZone);
  const firstHalf = d <= 15;
  const from = new Date(Date.UTC(y, mo - 1, firstHalf ? 1 : 16));
  const to = firstHalf ? new Date(Date.UTC(y, mo - 1, 15)) : new Date(Date.UTC(y, mo, 0));
  return { from: toDateInputValue(from, "UTC"), to: toDateInputValue(to, "UTC") };
}

/** 1st through the last day of "this month" in `timeZone`. */
export function currentMonthRange(timeZone: string = DEFAULT_TIMEZONE, now = new Date()) {
  const { y, mo } = zonedYMD(now, timeZone);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 0));
  return { from: toDateInputValue(from, "UTC"), to: toDateInputValue(to, "UTC") };
}

export type TimeEntryRangeInput = { userId?: string; from: Date; to: Date };

export type TimesheetTotal = {
  userId: string;
  userName: string;
  hourlyRate: number | null;
  hours: number;
  // Hours actually subtracted by a TimesheetBreakDeduction (see below) —
  // broken out from `hours` purely so the report/PDF can show what was
  // deducted, not folded silently into the total.
  breakHours: number;
  pay: number | null;
  hasOpenEntry: boolean;
};

type EntryWithUser = {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  user: { name: string; hourlyRate: number | null };
};

/** One TimesheetBreakDeduction row, as summarizeByUser needs it — `userId:
 * null` applies to every user's hours in [fromDate, toDate], not just one. */
export type BreakDeductionRule = {
  userId: string | null;
  fromDate: Date;
  toDate: Date;
  minutesPerDay: number;
};

function dayInRule(day: string, rule: BreakDeductionRule) {
  return day >= toDateInputValue(rule.fromDate, "UTC") && day <= toDateInputValue(rule.toDate, "UTC");
}

/** One clocked-in span within a single calendar day, as hours-since-local-
 * midnight (0–24) — one highlighted bar segment on the 24-hour timeline
 * chart (see DailyTimelineChart). A session that crosses local midnight is
 * split into two (or more) of these, one per day it touches, so it never
 * shows a session running past hour 24. */
export type DaySegment = { startHour: number; endHour: number };
export type DaySegments = { day: string; segments: DaySegment[] };

type EntryForSegments = { clockIn: Date; clockOut: Date | null };

/** This instant's hour-of-day (0–24, fractional) as read in `timeZone`. */
function hourOfDay(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return Number(parts.hour) + Number(parts.minute) / 60 + Number(parts.second) / 3600;
}

/** "yyyy-mm-dd" one calendar day after `day`, read as a plain UTC date (no
 * timezone conversion — `day` is already a zone-agnostic digit string). */
function nextDayString(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Buckets entries into per-day clocked-in segments (hours since local
 * midnight, in `timeZone`) for the 24-hour timeline chart. Unlike
 * summarizeByUser/summarizeByDay this keeps every session as its own
 * segment instead of summing into one number, so back-to-back sessions and
 * the gaps between them (time not clocked in) stay visible on the chart.
 * Summed across every user in `entries`, so pass entries already filtered
 * to one user (own chart) or a chosen subset (admin report).
 *
 * A session spanning local midnight is split at each midnight it crosses
 * into one segment per day. Open (still clocked-in) entries are clamped to
 * `now` rather than dropped, so an in-progress session still shows on
 * today's row.
 */
export function segmentsByDay(
  entries: EntryForSegments[],
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): DaySegments[] {
  const byDay = new Map<string, DaySegment[]>();
  const push = (day: string, startHour: number, endHour: number) => {
    if (endHour <= startHour) return;
    const segments = byDay.get(day) ?? [];
    segments.push({ startHour, endHour });
    byDay.set(day, segments);
  };

  for (const entry of entries) {
    const clockOut = entry.clockOut ?? now;
    if (clockOut <= entry.clockIn) continue;

    let cursor = entry.clockIn;
    // Cap the walk so a stuck-open entry from long ago can't spin through
    // years of empty midnights before giving up.
    for (let guard = 0; guard < 400; guard++) {
      const day = toDateInputValue(cursor, timeZone);
      const nextMidnight = new Date(zonedInputToISOString(`${nextDayString(day)}T00:00`, timeZone));
      if (clockOut <= nextMidnight) {
        push(day, hourOfDay(cursor, timeZone), hourOfDay(clockOut, timeZone));
        break;
      }
      push(day, hourOfDay(cursor, timeZone), 24);
      cursor = nextMidnight;
    }
  }

  return [...byDay.entries()]
    .map(([day, segments]) => ({ day, segments: segments.sort((a, b) => a.startHour - b.startHour) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Fills every day between `from` and `to` (both "yyyy-mm-dd", inclusive)
 * with an empty-segments day where segmentsByDay had no sessions — so the
 * chart shows one row per calendar day, not just the days someone happened
 * to clock in. */
export function fillSegmentsRange(daily: DaySegments[], from: string, to: string): DaySegments[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  const result: DaySegments[] = [];
  for (let cursor = Date.UTC(fy, fm - 1, fd); cursor <= end; cursor += 24 * 60 * 60 * 1000) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    result.push(byDay.get(day) ?? { day, segments: [] });
  }
  return result;
}

/** "yyyy-mm-dd" range for the `n` calendar days ending today, read in
 * `timeZone` — the default window for a staff member's own hours-per-day
 * chart (see MyTimeLog). */
export function lastNDaysRange(n: number, timeZone: string = DEFAULT_TIMEZONE, now = new Date()) {
  const [y, mo, d] = toDateInputValue(now, timeZone).split("-").map(Number);
  const to = Date.UTC(y, mo - 1, d);
  const from = to - (n - 1) * 24 * 60 * 60 * 1000;
  return { from: toDateInputValue(new Date(from), "UTC"), to: toDateInputValue(new Date(to), "UTC") };
}

/** Converts a [from, to] pair of "yyyy-mm-dd" date-only strings into the UTC
 * instants spanning that whole range's wall-clock days in `timeZone` — from
 * midnight the first day through the last instant of the last day. For any
 * *server-side* caller turning date-only input into a Prisma range: passing
 * `new Date(\`${from}T00:00:00\`)\` directly would parse against the
 * server's own local time instead of `timeZone` (the same bug fixed in the
 * timesheet PDF export route's date-range display). */
export function dayRangeToInstants(from: string, to: string, timeZone: string): { from: Date; to: Date } {
  const fromInstant = new Date(zonedInputToISOString(`${from}T00:00`, timeZone));
  const toInstant = new Date(new Date(zonedInputToISOString(`${to}T00:00`, timeZone)).getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from: fromInstant, to: toInstant };
}

/**
 * Groups a flat entry list into one totals row per user — used by the
 * report table, the PDF export, and the Wise payout amount alike, so all
 * three always agree on the same number.
 *
 * `breaks` are applied per calendar day (in `timeZone`, matching how the
 * sessions table itself buckets a shift to "the day it started"): any day
 * with worked hours that falls inside a rule's [fromDate, toDate] has that
 * rule's minutesPerDay subtracted from just that day, not once across the
 * whole range — a rule spanning a 15-day pay period with only 9 worked
 * days deducts 9 breaks, not 15. Overlapping rules for the same user (e.g.
 * a blanket one plus a specific one) stack. A day's deduction never pushes
 * that day below 0 hours.
 */
export function summarizeByUser(
  entries: EntryWithUser[],
  breaks: BreakDeductionRule[] = [],
  timeZone: string = DEFAULT_TIMEZONE
): TimesheetTotal[] {
  const meta = new Map<string, { userName: string; hourlyRate: number | null; hasOpenEntry: boolean }>();
  const dayHoursByUser = new Map<string, Map<string, number>>();

  for (const entry of entries) {
    const existing = meta.get(entry.userId) ?? {
      userName: entry.user.name,
      hourlyRate: entry.user.hourlyRate,
      hasOpenEntry: false,
    };
    if (!entry.clockOut) {
      existing.hasOpenEntry = true;
    } else {
      const day = toDateInputValue(entry.clockIn, timeZone);
      const hours = hoursBetween(entry.clockIn, entry.clockOut);
      const days = dayHoursByUser.get(entry.userId) ?? new Map<string, number>();
      days.set(day, (days.get(day) ?? 0) + hours);
      dayHoursByUser.set(entry.userId, days);
    }
    meta.set(entry.userId, existing);
  }

  const totals: TimesheetTotal[] = [];
  for (const [userId, info] of meta) {
    const days = dayHoursByUser.get(userId);
    let hours = 0;
    let breakHours = 0;
    if (days) {
      for (const [day, dayHours] of days) {
        const minutes = breaks
          .filter((b) => (b.userId === null || b.userId === userId) && dayInRule(day, b))
          .reduce((sum, b) => sum + b.minutesPerDay, 0);
        const deducted = Math.min(dayHours, minutes / 60);
        hours += dayHours - deducted;
        breakHours += deducted;
      }
    }
    totals.push({
      userId,
      userName: info.userName,
      hourlyRate: info.hourlyRate,
      hours,
      breakHours,
      pay: info.hourlyRate != null ? info.hourlyRate * hours : null,
      hasOpenEntry: info.hasOpenEntry,
    });
  }
  return totals.sort((a, b) => a.userName.localeCompare(b.userName));
}
