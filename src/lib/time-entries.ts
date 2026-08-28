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

/** The browser's own IANA zone (e.g. "America/Chicago") — the fallback used
 * everywhere below when a user hasn't set an explicit one in Account settings. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** `account.timezone` if set, else the browser's own — the single place
 * every time-clock display/input resolves "which zone am I working in". */
export function effectiveTimezone(accountTimezone: string | null | undefined): string {
  return accountTimezone || browserTimezone();
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
export function toDateInputValue(date: Date, timeZone: string = browserTimezone()): string {
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
export function currentPayPeriodRange(timeZone: string = browserTimezone(), now = new Date()) {
  const { y, mo, d } = zonedYMD(now, timeZone);
  const firstHalf = d <= 15;
  const from = new Date(Date.UTC(y, mo - 1, firstHalf ? 1 : 16));
  const to = firstHalf ? new Date(Date.UTC(y, mo - 1, 15)) : new Date(Date.UTC(y, mo, 0));
  return { from: toDateInputValue(from, "UTC"), to: toDateInputValue(to, "UTC") };
}

/** 1st through the last day of "this month" in `timeZone`. */
export function currentMonthRange(timeZone: string = browserTimezone(), now = new Date()) {
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
  pay: number | null;
  hasOpenEntry: boolean;
};

type EntryWithUser = {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  user: { name: string; hourlyRate: number | null };
};

/** Groups a flat entry list into one totals row per user — used by both the report table and the PDF export. */
export function summarizeByUser(entries: EntryWithUser[]): TimesheetTotal[] {
  const byUser = new Map<string, TimesheetTotal>();
  for (const entry of entries) {
    const existing = byUser.get(entry.userId) ?? {
      userId: entry.userId,
      userName: entry.user.name,
      hourlyRate: entry.user.hourlyRate,
      hours: 0,
      pay: 0,
      hasOpenEntry: false,
    };
    if (!entry.clockOut) {
      existing.hasOpenEntry = true;
    } else {
      const hours = hoursBetween(entry.clockIn, entry.clockOut);
      existing.hours += hours;
      existing.pay = (existing.pay ?? 0) + (existing.hourlyRate ?? 0) * hours;
    }
    byUser.set(entry.userId, existing);
  }
  const totals = [...byUser.values()];
  for (const t of totals) {
    if (t.hourlyRate === null) t.pay = null;
  }
  return totals.sort((a, b) => a.userName.localeCompare(b.userName));
}
