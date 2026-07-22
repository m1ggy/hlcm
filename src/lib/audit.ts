import { prisma } from "@/lib/prisma";

type AuditEntry = {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
};

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Writes one audit row per changed field so history reads as a diff, not a
 * blob. Call this from the service layer around every mutation — never rely
 * on DB triggers, since the business-meaning of a change (not just old/new
 * bytes) is what makes the log useful later.
 */
export async function recordAudit(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      field: entry.field,
      oldValue: stringify(entry.oldValue),
      newValue: stringify(entry.newValue),
      ipAddress: entry.ipAddress ?? undefined,
    },
  });
}

// Housekeeping columns that change on every write but carry no business
// meaning — logging them would drown out the fields anyone actually cares about.
const IGNORED_AUDIT_FIELDS = new Set(["updatedAt", "createdAt", "id"]);

export async function recordFieldChanges(params: {
  entityType: string;
  entityId: string;
  actorId: string;
  ipAddress?: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  action: string;
}) {
  const { entityType, entityId, actorId, ipAddress, before, after, action } = params;
  const changedFields = Object.keys(after).filter(
    (key) => !IGNORED_AUDIT_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );

  await Promise.all(
    changedFields.map((field) =>
      recordAudit({
        entityType,
        entityId,
        action,
        actorId,
        ipAddress,
        field,
        oldValue: before[field],
        newValue: after[field],
      })
    )
  );
}
