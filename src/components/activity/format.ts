import { formatDuration } from "@/lib/time-entries";

export function formatSeconds(sec: number) {
  return formatDuration(sec / 3600);
}

export function formatPct(pct: number | null) {
  return pct === null ? "—" : `${pct}%`;
}

export function timeIn(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });
}

/** Tailwind classes for an activity percentage: red low, amber middling, green high. */
export function activityTone(pct: number | null) {
  if (pct === null) return "bg-muted text-muted-foreground";
  if (pct >= 60) return "bg-emerald-500/80 text-white";
  if (pct >= 30) return "bg-amber-400/80 text-amber-950";
  return "bg-rose-500/80 text-white";
}

export const CATEGORY_LABEL = { PRODUCTIVE: "Productive", NEUTRAL: "Neutral", UNPRODUCTIVE: "Unproductive" } as const;

export const CATEGORY_TONE = {
  PRODUCTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  NEUTRAL: "bg-muted text-muted-foreground",
  UNPRODUCTIVE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
} as const;
