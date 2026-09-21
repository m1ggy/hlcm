// Pure helpers for the Everhour-style task time tracker — same
// dependency-free convention as src/lib/time-entries.ts (no prisma/server
// imports), so these are safe to use from client components (the weekly
// grid, the timer widget) as well as server actions and the PDF export.

import { hoursBetween, toDateInputValue, weekRangeForDay, formatDuration, DEFAULT_TIMEZONE } from "@/lib/time-entries";

// Lives here rather than the "use server" actions module for the same
// reason TimeClockError does in time-entries.ts — a stray class export from
// a server actions file silently drops every other export from it.
export class TaskTimeError extends Error {}

export type TaskTimeEntryLite = {
  id: string;
  userId: string;
  taskId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  billable: boolean;
  description: string | null;
  user: { name: string; hourlyRate: number | null };
  task: { label: string; estimatedHours: number | null; application: { name: string } | null } | null;
};

/** Hours for one entry — 0 for a still-open (endedAt null) entry, since its
 * duration isn't final yet (same "open entries don't count toward totals"
 * rule as summarizeByUser in time-entries.ts). */
export function entryHours(entry: { startedAt: Date; endedAt: Date | null }): number {
  if (!entry.endedAt) return 0;
  return hoursBetween(entry.startedAt, entry.endedAt);
}

export type TaskSummaryRow = {
  taskId: string | null;
  taskLabel: string;
  applicationName: string | null;
  estimatedHours: number | null;
  hours: number;
  billableAmount: number;
};

/**
 * Groups entries into one totals row per task (null taskId becomes the
 * "Internal / no task" bucket) — hours plus a billable-only dollar amount,
 * priced off each entry's own user.hourlyRate (the locked "reuse payroll
 * rate for client billing too" decision, not a separate client rate).
 * Feeds the list report, the weekly grid's row totals, and the "bill
 * tracked time" preview total alike.
 */
export function summarizeByTask(entries: TaskTimeEntryLite[]): TaskSummaryRow[] {
  const rows = new Map<string, TaskSummaryRow>();
  for (const entry of entries) {
    const hours = entryHours(entry);
    if (hours <= 0) continue;
    const key = entry.taskId ?? "__internal__";
    const existing = rows.get(key) ?? {
      taskId: entry.taskId,
      taskLabel: entry.task?.label ?? "Internal / no task",
      applicationName: entry.task?.application?.name ?? null,
      estimatedHours: entry.task?.estimatedHours ?? null,
      hours: 0,
      billableAmount: 0,
    };
    existing.hours += hours;
    if (entry.billable && entry.user.hourlyRate != null) {
      existing.billableAmount += hours * entry.user.hourlyRate;
    }
    rows.set(key, existing);
  }
  return [...rows.values()].sort((a, b) => a.taskLabel.localeCompare(b.taskLabel));
}

export type WeekGridRow = {
  taskId: string | null;
  taskLabel: string;
  estimatedHours: number | null;
  /** Monday–Sunday hours, index 0 = Monday, matching weekRangeForDay's convention. */
  days: number[];
  total: number;
};

/**
 * Pivots a flat entry list (already filtered to one week, one user) into
 * one row per task with a Monday–Sunday hours array — the weekly grid's
 * data shape. An entry that starts and ends on different calendar days
 * (crossing midnight) counts its hours entirely on the start day, same
 * "bucket to the day it started" convention listBreakEntries/summarizeByUser
 * use for the attendance clock.
 */
export function weekGridRows(entries: TaskTimeEntryLite[], weekStart: string, timeZone: string = DEFAULT_TIMEZONE): WeekGridRow[] {
  const { from } = weekRangeForDay(weekStart);
  const [y, m, d] = from.split("-").map(Number);
  const mondayUtc = Date.UTC(y, m - 1, d);

  const rows = new Map<string, WeekGridRow>();
  for (const entry of entries) {
    const hours = entryHours(entry);
    if (hours <= 0) continue;
    const day = toDateInputValue(entry.startedAt, timeZone);
    const [dy, dm, dd] = day.split("-").map(Number);
    const dayIndex = Math.round((Date.UTC(dy, dm - 1, dd) - mondayUtc) / 86_400_000);
    if (dayIndex < 0 || dayIndex > 6) continue; // outside the requested week — caller should have already filtered, this just guards the pivot

    const key = entry.taskId ?? "__internal__";
    const existing = rows.get(key) ?? {
      taskId: entry.taskId,
      taskLabel: entry.task?.label ?? "Internal / no task",
      estimatedHours: entry.task?.estimatedHours ?? null,
      days: [0, 0, 0, 0, 0, 0, 0],
      total: 0,
    };
    existing.days[dayIndex] += hours;
    existing.total += hours;
    rows.set(key, existing);
  }
  return [...rows.values()].sort((a, b) => a.taskLabel.localeCompare(b.taskLabel));
}

/** Budget-bar severity for a task row — same two-tier (amber/red) shape as
 * computeLicenseAlerts/computeEnvelopeAlerts in src/lib/aging-alerts.ts,
 * just measured in hours-over-estimate instead of days-to-expiry. Null
 * estimate or zero tracked hours never alerts — nothing to compare yet. */
export function budgetSeverity(hours: number, estimatedHours: number | null): "ok" | "warning" | "critical" | null {
  if (estimatedHours == null || estimatedHours <= 0) return null;
  const ratio = hours / estimatedHours;
  if (ratio >= 1) return "critical";
  if (ratio >= 0.8) return "warning";
  return "ok";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Mon, Sep 14" for a "yyyy-mm-dd" day string — a plain calendar-date
 * label, no timezone conversion (the string is already resolved to
 * whichever zone matters), so it's safe on both server and client. */
export function formatDayLabel(day: string): string {
  const { m, d, weekday } = ymd(day);
  return `${WEEKDAYS[weekday]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Sep 14 – 20, 2026" (same month) or "Sep 28 – Oct 4, 2026". */
export function formatWeekRangeLabel(from: string, to: string): string {
  const a = ymd(from);
  const b = ymd(to);
  const start = `${MONTHS[a.m - 1]} ${a.d}`;
  const end = a.m === b.m ? `${b.d}` : `${MONTHS[b.m - 1]} ${b.d}`;
  return `${start} – ${end}, ${b.y}`;
}

/** Like formatDuration, but a real (>0) sub-minute span reads "<1m"
 * instead of a misleading "0m" — an instant start/stop still shows up as
 * something that happened. */
export function formatTrackedDuration(totalHours: number): string {
  if (totalHours > 0 && Math.round(totalHours * 60) === 0) return "<1m";
  return formatDuration(totalHours);
}

/**
 * Parses what people actually type for a duration: "1h 30m", "1h", "45m",
 * "1.5" / "1.5h" (decimal hours), "1:30", or a bare "90" (minutes, when
 * it's clearly not hours — see below). Returns hours, or null when it
 * can't be understood or isn't positive.
 */
export function parseDurationInput(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const clock = text.match(/^(\d+):(\d{1,2})$/);
  if (clock) return finalize(Number(clock[1]) + Number(clock[2]) / 60);

  const parts = text.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (parts && (parts[1] || parts[2])) return finalize(Number(parts[1] ?? 0) + Number(parts[2] ?? 0) / 60);

  const bare = text.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = Number(bare[1]);
    // "1.5", "2", "8" read as hours; anything over a workday's worth of
    // hours ("90", "120") can only sensibly mean minutes.
    return finalize(n > 24 ? n / 60 : n);
  }
  return null;
}

function finalize(hours: number): number | null {
  return Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : null;
}
