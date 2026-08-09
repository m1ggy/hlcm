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
