import { STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  clientId: "Client",
  assignedUserId: "Assigned To",
  status: "Status",
  licenseTypeTemplateId: "License Type",
  caseTypeId: "Case Type",
  blockedReason: "Blocked reason",
  dueDate: "Due date",
  reviewerUserId: "Reviewer",
  mfaEnabled: "MFA",
  active: "Active",
};

const ACTION_VERBS: Record<string, string> = {
  create: "Created",
  create_subtask: "Created subtask",
  create_standalone: "Created",
  update: "Updated",
  delete: "Deleted",
  deactivate: "Deactivated",
  change_password: "Changed password",
  enable_mfa: "Enabled MFA",
  disable_mfa: "Disabled MFA",
  flag_for_review: "Flagged for review",
  clear_review: "Cleared review flag",
  share: "Shared access",
  update_share: "Updated shared access",
  unshare: "Removed shared access",
  upload_file: "Uploaded a file",
  delete_file: "Deleted a file",
};

// Actions whose old/new value is a one-off event payload (a filename, a
// "userId:permission" pair) rather than a before/after property change —
// these get a custom sentence instead of the generic "X changed from A to B".
const EVENT_ACTIONS = new Set(["share", "update_share", "unshare", "upload_file", "delete_file"]);

export function isEventAction(action: string) {
  return EVENT_ACTIONS.has(action);
}

export function formatEventDescription(
  action: string,
  oldValue: string | null,
  newValue: string | null,
  users: Record<string, string> = {}
) {
  const permissionLabel = (p: string) => (p === "EDIT" ? "can edit" : "can view");

  if (action === "share" && newValue) {
    const [userId, permission] = newValue.split(":");
    return `Shared with ${users[userId] ?? userId} (${permissionLabel(permission)})`;
  }
  if (action === "update_share" && newValue) {
    const [, permission] = newValue.split(":");
    return `Updated shared access to ${permissionLabel(permission)}`;
  }
  if (action === "unshare") return "Removed a shared access grant";
  if (action === "upload_file" && newValue) return `Uploaded "${newValue}"`;
  if (action === "delete_file" && oldValue) return `Deleted "${oldValue}"`;
  return formatActionVerb(action);
}

export function formatFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field;
}

export function formatActionVerb(action: string) {
  return ACTION_VERBS[action] ?? action;
}

/**
 * Resolves a raw audit old/new value into something a human would recognize —
 * status codes become their display label, foreign-key IDs become names via
 * the lookup maps (built from data already loaded for the page), dates get
 * localized. Falls back to the raw value when there's nothing to resolve
 * against (e.g. the referenced record was later deleted).
 */
export function formatAuditValue(
  field: string | null,
  value: string | null,
  lookups: { clients?: Record<string, string>; users?: Record<string, string> } = {}
) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status") {
    return STATUS_LABELS[value as ApplicationStatus] ?? TASK_STATUS_LABELS[value as TaskStatusValue] ?? value;
  }
  if (field === "clientId") return lookups.clients?.[value] ?? value;
  if (field === "assignedUserId" || field === "reviewerUserId") return lookups.users?.[value] ?? value;
  if (field === "dueDate" || field === "createdAt" || field === "updatedAt") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
  return value;
}
