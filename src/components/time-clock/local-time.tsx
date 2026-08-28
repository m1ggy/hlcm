"use client";

import { effectiveTimezone } from "@/lib/time-entries";

// Server component (MyTimeLog) can't call toLocaleDateString/toLocaleTimeString
// itself — that would format in the server's timezone, not the viewer's,
// showing wrong times. These tiny client components take the raw ISO string
// and format it in the browser instead (same cross-boundary pattern as
// TimeClockWidget's clockIn prop). `timeZone` is the viewer's Account
// setting — null means they haven't set one, so it falls back to
// DEFAULT_TIMEZONE (see effectiveTimezone), not the browser's own zone —
// everyone sees the same wall-clock hours by default, whichever browser
// they're viewing from.
export function LocalDate({ iso, timeZone }: { iso: string; timeZone: string | null }) {
  return <>{new Date(iso).toLocaleDateString(undefined, { timeZone: effectiveTimezone(timeZone) })}</>;
}

export function LocalTime({ iso, timeZone }: { iso: string; timeZone: string | null }) {
  return (
    <>
      {new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: effectiveTimezone(timeZone),
      })}
    </>
  );
}
