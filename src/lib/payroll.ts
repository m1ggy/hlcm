// Client-safe payroll helpers: pay period math, labels and statuses.
// Server-side reads/writes live in src/lib/actions/payroll.ts; the time
// lock lives in src/lib/payroll-lock.ts. See docs/payroll-plan.md.

import { DEFAULT_TIMEZONE, toDateInputValue } from "@/lib/time-entries";

/** The calendar every pay period and the time lock are worked out in. One
 * fixed zone (not each viewer's own) so a shift belongs to the same period
 * for everyone. */
export const PAYROLL_TIMEZONE = DEFAULT_TIMEZONE;

export type PeriodRange = { start: string; end: string }; // "yyyy-mm-dd"

/** The semi-monthly period (1st–15th or 16th–end) containing `day`. */
export function periodForDay(day: string): PeriodRange {
  const [y, m, d] = day.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d <= 15) return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15` };
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/** The period before the one starting on `start`. */
export function previousPeriod(start: string): PeriodRange {
  const prevDay = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return periodForDay(prevDay);
}

/** The current period and the `count - 1` before it, newest first. */
export function recentPeriods(count: number, now = new Date()): PeriodRange[] {
  const out = [periodForDay(toDateInputValue(now, PAYROLL_TIMEZONE))];
  while (out.length < count) out.push(previousPeriod(out[out.length - 1].start));
  return out;
}

/** True when `start`/`end` are exactly one real period — guards input
 * coming from the URL or the client. */
export function isValidPeriod(range: PeriodRange): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start)) return false;
  const p = periodForDay(range.start);
  return p.start === range.start && p.end === range.end;
}

/** "yyyy-mm-dd" ↔ the UTC-midnight Date Prisma uses for a @db.Date column. */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}
export function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Oct 16 – 31, 2026" (same month) or "Dec 16 – Dec 31, 2026". */
export function formatPeriod(range: PeriodRange): string {
  const s = dayToDate(range.start);
  const e = dayToDate(range.end);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${month(s)} ${s.getUTCDate()} – ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
}

/** A date-only value ("Nov 3, 2026") without timezone drift. */
export function formatDay(day: string | Date): string {
  const d = typeof day === "string" ? dayToDate(day) : day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export const PAYROLL_METHODS = ["DIRECT_DEPOSIT", "CHECK", "WISE", "CASH", "OTHER"] as const;
export type PayrollMethodValue = (typeof PAYROLL_METHODS)[number];

export const PAYROLL_METHOD_LABELS: Record<PayrollMethodValue, string> = {
  DIRECT_DEPOSIT: "Direct deposit",
  CHECK: "Check",
  WISE: "Wise",
  CASH: "Cash",
  OTHER: "Other",
};

export type PaymentStatus = "awaiting" | "received" | "problem" | "resolved";

/** Where a paid person stands — derived, never stored. A resolved problem
 * goes back to waiting on the person until they confirm receipt. */
export function paymentStatus(p: {
  acknowledgedAt: Date | null;
  problemReportedAt: Date | null;
  problemResolvedAt: Date | null;
}): PaymentStatus {
  if (p.acknowledgedAt) return "received";
  if (p.problemReportedAt && !p.problemResolvedAt) return "problem";
  if (p.problemResolvedAt) return "resolved";
  return "awaiting";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus | "unpaid", string> = {
  unpaid: "Not paid",
  awaiting: "Paid – awaiting confirmation",
  received: "Received",
  problem: "Problem reported",
  resolved: "Problem resolved – awaiting confirmation",
};

/** Rounds to cents — money is stored as Float like the rest of the app. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
