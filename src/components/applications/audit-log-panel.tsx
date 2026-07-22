import { formatActionVerb, formatAuditValue, formatFieldLabel, isEventAction, formatEventDescription } from "@/lib/audit-format";

type AuditEntry = {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  actor: { name: string };
};

function describe(
  entry: AuditEntry,
  lookups: { clients?: Record<string, string>; users?: Record<string, string> }
) {
  if (isEventAction(entry.action)) {
    return formatEventDescription(entry.action, entry.oldValue, entry.newValue, lookups.users ?? {});
  }
  if (entry.field) {
    const label = formatFieldLabel(entry.field);
    const from = formatAuditValue(entry.field, entry.oldValue, lookups);
    const to = formatAuditValue(entry.field, entry.newValue, lookups);
    return `${label} changed from “${from}” to “${to}”`;
  }
  return formatActionVerb(entry.action);
}

export function AuditLogPanel({
  auditLog,
  clients = {},
  users = {},
}: {
  auditLog: AuditEntry[];
  clients?: Record<string, string>;
  users?: Record<string, string>;
}) {
  if (auditLog.length === 0) {
    return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {auditLog.map((entry) => (
        <div key={entry.id} className="border-b pb-2 text-sm last:border-0">
          <div>{describe(entry, { clients, users })}</div>
          <div className="text-xs text-muted-foreground">
            {entry.actor.name} · {new Date(entry.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
