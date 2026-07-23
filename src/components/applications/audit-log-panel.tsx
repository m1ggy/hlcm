import { formatActionVerb, formatAuditValue, formatFieldLabel, isEventAction, formatEventDescription } from "@/lib/audit-format";
import { AvatarInitials } from "@/components/ui/avatar-initials";

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
    <div className="space-y-0">
      {auditLog.map((entry, i) => (
        <div key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < auditLog.length - 1 && (
            <span className="absolute top-7 left-3.5 h-[calc(100%-0.75rem)] w-px -translate-x-1/2 bg-border" />
          )}
          <AvatarInitials name={entry.actor.name} className="relative z-10" />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm">
              <span className="font-medium">{entry.actor.name}</span>{" "}
              <span className="text-muted-foreground">{describe(entry, { clients, users })}</span>
            </p>
            <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
