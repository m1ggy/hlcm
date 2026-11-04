// Pure helpers for Caregiver visits — schedule math, labels, statuses.
// Dependency-free (no prisma/server imports) so the Today page, the staff
// Care Recipients card, and the server actions all share one definition.
import { haversineMeters, NEAR_THRESHOLD_METERS } from "@/lib/geolocation";

/** A visit is identified by its first TimeEntry segment — see
 * TimeEntry.visitStartId in prisma/schema.prisma. */
export function visitIdOf(entry: { id: string; visitStartId: string | null }): string {
  return entry.visitStartId ?? entry.id;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Mon-first display order — how a weekly schedule reads in the US. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** "HH:mm" (from an <input type="time">) -> minutes since midnight, or null. */
export function parseTimeInput(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

/** 540 -> "9:00 AM", 1440 -> "12:00 AM" (end of day). */
export function formatMinuteOfDay(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatShiftRange(startMinute: number, endMinute: number): string {
  if (startMinute === 0 && endMinute === 1440) return "All day";
  return `${formatMinuteOfDay(startMinute)} – ${formatMinuteOfDay(endMinute)}`;
}

/** Collapses a set of weekdays into a compact label: "Mon, Wed, Fri",
 * "Mon–Fri", "Every day". */
export function formatWeekdays(weekdays: number[]): string {
  const set = new Set(weekdays);
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Mon–Fri";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEKDAY_DISPLAY_ORDER.filter((d) => set.has(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}

/** `date`'s wall-clock day/weekday/minute in `timeZone`. */
export function zonedClock(date: Date, timeZone: string): { day: string; weekday: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_SHORT.indexOf(parts.weekday as (typeof WEEKDAY_SHORT)[number]),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// How long past a shift's start before an unstarted visit reads as late.
export const LATE_GRACE_MINUTES = 15;
// How early a clock-in still counts toward a shift — arriving a bit before
// the scheduled start is normal and shouldn't leave the shift "late".
const EARLY_ARRIVAL_MINUTES = 60;

export type ShiftStatus = "upcoming" | "late" | "in_progress" | "done" | "missed";

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  upcoming: "Upcoming",
  late: "Late",
  in_progress: "In progress",
  done: "Done",
  missed: "Missed",
};

/**
 * Where today's shift stands, given the visits this Caregiver logged for
 * this recipient today (as minutes-of-day in the same zone; `end` null =
 * still open). A visit counts toward the shift when it overlaps the shift
 * window, allowing an early arrival.
 */
export function shiftStatus(
  shift: { startMinute: number; endMinute: number },
  visitsToday: { start: number; end: number | null }[],
  nowMinute: number
): ShiftStatus {
  // A visit underway with this person covers any shift that hasn't ended
  // yet, however early it started — they're there now.
  if (nowMinute < shift.endMinute && visitsToday.some((v) => v.end === null && v.start < shift.endMinute)) {
    return "in_progress";
  }
  const match = visitsToday.find(
    (v) => v.start < shift.endMinute && (v.end ?? nowMinute) >= shift.startMinute - EARLY_ARRIVAL_MINUTES
  );
  if (match) return match.end === null ? "in_progress" : "done";
  if (nowMinute < shift.startMinute + LATE_GRACE_MINUTES) return "upcoming";
  if (nowMinute < shift.endMinute) return "late";
  return "missed";
}

/** Clock-in distance from the recipient's geocoded address, when both
 * sides exist. */
export function clockInDistance(
  entry: { clockInLatitude: number | null; clockInLongitude: number | null },
  recipient: { latitude: number | null; longitude: number | null } | null
): { meters: number; near: boolean } | null {
  if (entry.clockInLatitude == null || entry.clockInLongitude == null) return null;
  if (recipient?.latitude == null || recipient.longitude == null) return null;
  const meters = haversineMeters(entry.clockInLatitude, entry.clockInLongitude, recipient.latitude, recipient.longitude);
  return { meters, near: meters <= NEAR_THRESHOLD_METERS };
}

export const INCIDENT_CATEGORIES = [
  "FALL_OR_INJURY",
  "HEALTH_CHANGE",
  "MEDICATION",
  "BEHAVIOR",
  "HOME_SAFETY",
  "OTHER",
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  FALL_OR_INJURY: "Fall or injury",
  HEALTH_CHANGE: "Change in health",
  MEDICATION: "Medication issue",
  BEHAVIOR: "Mood or behavior",
  HOME_SAFETY: "Home safety",
  OTHER: "Something else",
};
