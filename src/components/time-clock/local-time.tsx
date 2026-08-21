"use client";

// Server component (MyTimeLog) can't call toLocaleDateString/toLocaleTimeString
// itself — that would format in the server's timezone, not the viewer's,
// showing wrong times. These tiny client components take the raw ISO string
// and format it in the browser instead (same cross-boundary pattern as
// TimeClockWidget's clockIn prop).
export function LocalDate({ iso }: { iso: string }) {
  return <>{new Date(iso).toLocaleDateString()}</>;
}

export function LocalTime({ iso }: { iso: string }) {
  return <>{new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>;
}
