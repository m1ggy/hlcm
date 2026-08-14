// The 6 aging-alert rules from docs/pipeline-stage-plan.md. No scheduler in
// this app (Notification is pull-based, computed inline by actions) — these
// are computed on read the same way, not written anywhere or backed by a
// cron job. Pure and DB-free so they're unit-testable directly; the actions
// in src/lib/actions/alerts.ts do the querying and call these per row.
//
// Stage matching is by abbrev suffix rather than a hardcoded per-pipeline
// list — "Supervisor Review" is SVR in HOME_CARE/MCO and S1 SVR/S2 SVR in
// CILA, all ending the same way, so one check covers every pipeline instead
// of three parallel lists that could drift out of sync.
const DAY_MS = 24 * 60 * 60 * 1000;

export type AgingAlertSeverity = "warning" | "critical";
export type AgingAlert = { message: string; severity: AgingAlertSeverity };

export type AgingAlertInput = {
  entityType: "Application" | "McoCredential";
  stageAbbrev: string | null;
  daysInStage: number | null;
  followUpDate: Date | null;
  deficiencyResponseDueDate: Date | null;
  deficiencyResponseSubmittedDate: Date | null;
  recredentialingDueDate: Date | null;
};

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

export function computeAgingAlerts(input: AgingAlertInput, now: Date = new Date()): AgingAlert[] {
  const alerts: AgingAlert[] = [];
  const stageEndsWith = (suffix: string) => (input.stageAbbrev ?? "").endsWith(suffix);

  // Rule 1: Supervisor Review over 3 days -> flag the Manager.
  if (stageEndsWith("SVR") && input.daysInStage !== null && input.daysInStage > 3) {
    alerts.push({ message: `In Supervisor Review for ${input.daysInStage} days — flag the Manager.`, severity: "warning" });
  }

  // Rule 2: Waiting on Client Docs over 14 days -> flag for a client follow-up call.
  if (stageEndsWith("WCD") && input.daysInStage !== null && input.daysInStage > 14) {
    alerts.push({ message: `Waiting on Client Docs for ${input.daysInStage} days — due for a follow-up call.`, severity: "warning" });
  }

  // Rule 3: Corrections Received with response due within 7 days -> daily
  // flag until submitted.
  if (stageEndsWith("COR") && input.deficiencyResponseDueDate && !input.deficiencyResponseSubmittedDate) {
    const days = daysUntil(input.deficiencyResponseDueDate, now);
    if (days <= 7) {
      alerts.push({
        message: days < 0 ? `Corrections response is ${-days} day(s) overdue.` : `Corrections response due in ${days} day(s).`,
        severity: days < 0 ? "critical" : "warning",
      });
    }
  }

  // Rule 4: On Hold past the follow-up date -> flag.
  if (input.stageAbbrev === "HLD" && input.followUpDate && input.followUpDate.getTime() < now.getTime()) {
    alerts.push({ message: "On Hold past its follow-up date.", severity: "critical" });
  }

  // Rule 5: MCO Credentialing In Review over 90 days -> flag for a status call.
  if (input.entityType === "McoCredential" && input.stageAbbrev === "CIR" && input.daysInStage !== null && input.daysInStage > 90) {
    alerts.push({ message: `In Credentialing Review for ${input.daysInStage} days — due for a status call to the MCO rep.`, severity: "warning" });
  }

  // Rule 6: MCO Recredentialing Due Date within 120 days -> flag to start recredentialing.
  if (input.entityType === "McoCredential" && input.recredentialingDueDate) {
    const days = daysUntil(input.recredentialingDueDate, now);
    if (days <= 120) {
      alerts.push({
        message: days < 0 ? `Recredentialing is ${-days} day(s) overdue.` : `Recredentialing due in ${days} day(s) — start the process.`,
        severity: days < 30 ? "critical" : "warning",
      });
    }
  }

  return alerts;
}
