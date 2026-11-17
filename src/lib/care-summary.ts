import { db } from "@/lib/db";
import { dayRangeToInstants, hoursBetween, toDateInputValue } from "@/lib/time-entries";

// The care line on a care agency's weekly summary (docs/client-care-plan.md,
// Phase 3): visits made and missed, and concerns, Monday to Sunday. Days are
// read in the workspace's timezone; a scheduled slot counts as missed once
// its day (or, today, its end time) has passed with no visit by that
// caregiver to that client.

export type CareWeek = {
  visits: number;
  visitHours: number;
  missed: number;
  concernsRaised: number;
  openConcerns: number;
  /** Per day, Monday first — for the sparklines. */
  days: { date: string; visits: number; missed: number }[];
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function minuteOfDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export async function getCareWeek(opts: { monday: string; timeZone: string; now?: Date }): Promise<CareWeek> {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone;
  const sunday = addDays(opts.monday, 6);
  const range = dayRangeToInstants(opts.monday, sunday, tz);
  const today = toDateInputValue(now, tz);
  const nowMinute = minuteOfDay(now, tz);

  const [entries, shifts, raised, open] = await Promise.all([
    db.timeEntry.findMany({
      where: { careRecipientId: { not: null }, clockIn: { gte: range.from, lte: range.to } },
      select: { userId: true, careRecipientId: true, clockIn: true, clockOut: true, visitStartId: true },
    }),
    db.visitShift.findMany({
      where: { careRecipient: { active: true }, caregiver: { active: true } },
      select: { weekday: true, startMinute: true, endMinute: true, caregiverId: true, careRecipientId: true, createdAt: true },
    }),
    db.careIncident.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.careIncident.count({ where: { resolvedAt: null, careRecipient: { active: true } } }),
  ]);

  const visitDays = new Set<string>();
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(opts.monday, i), visits: 0, missed: 0 }));
  let visitHours = 0;
  for (const e of entries) {
    const day = toDateInputValue(e.clockIn, tz);
    visitDays.add(`${day}|${e.userId}|${e.careRecipientId}`);
    visitHours += hoursBetween(e.clockIn, e.clockOut ?? now);
    // A visit split by a break is one visit: count its first segment only.
    if (!e.visitStartId) {
      const d = days.find((x) => x.date === day);
      if (d) d.visits++;
    }
  }

  for (const d of days) {
    if (d.date > today) continue;
    const weekday = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    for (const s of shifts) {
      if (s.weekday !== weekday) continue;
      // Not scheduled yet back then.
      if (toDateInputValue(s.createdAt, tz) > d.date) continue;
      if (d.date === today && s.endMinute > nowMinute) continue;
      if (!visitDays.has(`${d.date}|${s.caregiverId}|${s.careRecipientId}`)) d.missed++;
    }
  }

  return {
    visits: days.reduce((sum, d) => sum + d.visits, 0),
    visitHours: Math.round(visitHours * 10) / 10,
    missed: days.reduce((sum, d) => sum + d.missed, 0),
    concernsRaised: raised,
    openConcerns: open,
    days,
  };
}
