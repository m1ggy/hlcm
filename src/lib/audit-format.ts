import { STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  clientId: "Client",
  assignedUserId: "Assigned VA",
  assignedManagerId: "Assigned Manager",
  status: "Status",
  agency: "Agency",
  ballIsWith: "Ball is with",
  correctionRound: "Correction round",
  deficiencyReceivedDate: "Deficiency received",
  deficiencyResponseDueDate: "Deficiency response due",
  deficiencyResponseSubmittedDate: "Deficiency response submitted",
  licenseTypeTemplateId: "License Type",
  caseTypeId: "Case Type",
  blockedReason: "Blocked reason",
  dueDate: "Due date",
  reviewerUserId: "Reviewer",
  mfaEnabled: "MFA",
  active: "Active",
  contactInfo: "Contact info",
  address: "Address",
  businessName: "Business name",
  businessPhone: "Business phone",
  businessEmail: "Business email",
  ownerName: "Owner name",
  ownerEmail: "Owner email",
  ownerPhone: "Owner phone",
  ownerDateOfBirth: "Owner date of birth",
  hourlyRate: "Hourly rate",
  email: "Email",
  role: "Role",
};

const ACTION_VERBS: Record<string, string> = {
  create: "Created",
  create_subtask: "Created subtask",
  create_standalone: "Created",
  update: "Updated",
  delete: "Deleted",
  deactivate: "Deactivated",
  archive: "Archived",
  restore: "Restored",
  link_project: "Added to a project",
  unlink_project: "Removed from a project",
  change_stage: "Changed stage",
  set_rate: "Set hourly rate",
  clock_in: "Clocked in",
  clock_out: "Clocked out",
  save: "Saved",
  pay: "Paid via Wise",
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
  generate_document: "Generated a document",
  update_document_status: "Updated document status",
  delete_document: "Deleted a document",
  sign_document: "Signed a document",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  SENT: "Sent",
};

const AGENCY_LABELS: Record<string, string> = { IDPH: "IDPH", IDOA: "IDoA", IDHS: "IDHS", OTHER: "Other" };
const BALL_WITH_LABELS: Record<string, string> = { CTK: "CTK", CLIENT: "Client", GOVERNMENT: "Government" };

// Actions whose old/new value is a one-off event payload (a filename, a
// "userId:permission" pair) rather than a before/after property change —
// these get a custom sentence instead of the generic "X changed from A to B".
const EVENT_ACTIONS = new Set([
  "share",
  "update_share",
  "unshare",
  "upload_file",
  "delete_file",
  "generate_document",
  "update_document_status",
  "delete_document",
  "sign_document",
  "link_project",
  "unlink_project",
  "change_stage",
]);

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
  if (action === "generate_document" && newValue) return `Generated "${newValue}"`;
  if (action === "update_document_status" && newValue) {
    const [fileName, status] = newValue.split(":");
    return `Marked "${fileName}" as ${DOCUMENT_STATUS_LABELS[status] ?? status}`;
  }
  if (action === "delete_document" && oldValue) return `Deleted "${oldValue}"`;
  if (action === "sign_document" && newValue) return `Signed and saved as "${newValue}"`;
  if (action === "link_project" && newValue) return `Added to project "${newValue}"`;
  if (action === "unlink_project" && oldValue) return `Removed from project "${oldValue}"`;
  if (action === "change_stage" && newValue) {
    return oldValue ? `Moved from "${oldValue}" to "${newValue}"` : `Set to "${newValue}"`;
  }
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
  if (field === "assignedUserId" || field === "reviewerUserId" || field === "assignedManagerId") {
    return lookups.users?.[value] ?? value;
  }
  if (
    field === "dueDate" ||
    field === "createdAt" ||
    field === "updatedAt" ||
    field === "ownerDateOfBirth" ||
    field === "deficiencyReceivedDate" ||
    field === "deficiencyResponseDueDate" ||
    field === "deficiencyResponseSubmittedDate"
  ) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }
  if (field === "agency") return AGENCY_LABELS[value] ?? value;
  if (field === "ballIsWith") return BALL_WITH_LABELS[value] ?? value;
  if (field === "hourlyRate") {
    const rate = Number(value);
    return Number.isNaN(rate) ? value : `$${rate.toFixed(2)}/hr`;
  }
  return value;
}
