// How many days a case can sit in a given status before it's flagged as
// stuck. NEEDS_REVISION is on us to act on; UNDER_AGENCY_REVIEW is mostly
// out of our hands, so it gets more slack before we call it out.
export const STALE_THRESHOLD_DAYS: Partial<Record<string, number>> = {
  NEEDS_REVISION: 3,
  UNDER_AGENCY_REVIEW: 14,
};

export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// Checklist fully closed but the case is still sitting in one of the two
// "internal work" statuses — someone should move it forward.
export function computeReadyToSubmit(
  status: string,
  taskProgress: { total: number; done: number }
): boolean {
  return (
    (status === "DRAFT" || status === "INFO_GATHERING") &&
    taskProgress.total > 0 &&
    taskProgress.done === taskProgress.total
  );
}

// Returns days spent in the current status if it's past that status's
// threshold, otherwise null (not stale, or status has no threshold).
export function computeStaleDays(status: string, statusSince: Date): number | null {
  const threshold = STALE_THRESHOLD_DAYS[status];
  if (threshold === undefined) return null;
  const days = daysSince(statusSince);
  return days >= threshold ? days : null;
}
