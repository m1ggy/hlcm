import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatShiftRange, INCIDENT_CATEGORY_LABELS, SHIFT_STATUS_LABELS, type ShiftStatus } from "@/lib/visits";

export type CareVisitAlerts = {
  scheduledToday: number;
  problems: { id: string; status: ShiftStatus; caregiverName: string; recipientName: string; careRecipientId: string; clientId: string | null; startMinute: number; endMinute: number }[];
  openIncidents: {
    id: string;
    category: keyof typeof INCIDENT_CATEGORY_LABELS;
    urgent: boolean;
    createdAt: Date;
    careRecipient: { id: string; name: string; clientId: string | null };
    reportedBy: { name: string };
  }[];
};

/**
 * Where a recipient lives for the office: under their agency's client page
 * in the full CRM, on the Clients page in a tasks-only workspace with care
 * (docs/client-care-plan.md). Null = nowhere to link (a full-CRM recipient
 * with no agency).
 */
export function recipientHref(recipient: { id: string; clientId: string | null }, tasksWorkspace: boolean): string | null {
  if (tasksWorkspace) return `/care-recipients?open=${recipient.id}`;
  return recipient.clientId ? `/clients/${recipient.clientId}#care-recipients` : null;
}

function RecipientName({ id, clientId, name, tasksWorkspace }: { id: string; clientId: string | null; name: string; tasksWorkspace: boolean }) {
  const href = recipientHref({ id, clientId }, tasksWorkspace);
  return href ? (
    <Link href={href} className="font-medium hover:underline">
      {name}
    </Link>
  ) : (
    <span className="font-medium">{name}</span>
  );
}

// Today's late/missed visits and open concerns (getCareVisitAlerts) — the
// full CRM's dashboard and a care agency's Clients page.
export function CareVisitsTodayCard({ alerts, tasksWorkspace = false }: { alerts: CareVisitAlerts; tasksWorkspace?: boolean }) {
  return (
    <Card id="care-visits">
      <CardHeader>
        <CardTitle>Care Visits Today</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.openIncidents.map((incident) => (
          <div key={incident.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-b-0">
            <div>
              <RecipientName {...incident.careRecipient} tasksWorkspace={tasksWorkspace} />
              <p className="text-xs text-muted-foreground">
                {INCIDENT_CATEGORY_LABELS[incident.category]} · reported by {incident.reportedBy.name}{" "}
                {new Date(incident.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
            <Badge variant={incident.urgent ? "destructive" : "outline"}>{incident.urgent ? "Urgent concern" : "Concern"}</Badge>
          </div>
        ))}
        {alerts.problems.map((p) => (
          <div key={p.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-b-0">
            <div>
              <RecipientName id={p.careRecipientId} clientId={p.clientId} name={p.recipientName} tasksWorkspace={tasksWorkspace} />
              <p className="text-xs text-muted-foreground">
                {p.caregiverName} · {formatShiftRange(p.startMinute, p.endMinute)}
              </p>
            </div>
            <span className={`text-xs font-medium ${p.status === "missed" ? "text-destructive" : "text-amber-600 dark:text-amber-500"}`}>
              {p.status === "missed" ? "Missed" : `${SHIFT_STATUS_LABELS.late} — not started`}
            </span>
          </div>
        ))}
        {alerts.problems.length === 0 && alerts.openIncidents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {alerts.scheduledToday === 0
              ? "No visits scheduled today."
              : `All ${alerts.scheduledToday} scheduled visit${alerts.scheduledToday === 1 ? " is" : "s are"} on track.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
