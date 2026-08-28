"use client";

// Server component (MyTimeLog) can't call toLocaleDateString/toLocaleTimeString
// itself — that would format in the server's timezone, not the viewer's,
// showing wrong times. These tiny client components take the raw ISO string
// and format it in the browser instead (same cross-boundary pattern as
// TimeClockWidget's clockIn prop). `timeZone` is the viewer's Account
// setting — null means they haven't set one, so `timeZone: undefined` is
// passed to Intl instead, which (running here, client-side) resolves to
// the browser's own zone, same as before this setting existed.
export function LocalDate({ iso, timeZone }: { iso: string; timeZone: string | null }) {
  return <>{new Date(iso).toLocaleDateString(undefined, { timeZone: timeZone ?? undefined })}</>;
}

export function LocalTime({ iso, timeZone }: { iso: string; timeZone: string | null }) {
  return (
    <>{new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? undefined })}</>
  );
}
