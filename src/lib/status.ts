export const APPLICATION_STATUSES = [
  "DRAFT",
  "INFO_GATHERING",
  "SUBMITTED",
  "UNDER_AGENCY_REVIEW",
  "NEEDS_REVISION",
  "APPROVED",
  "DENIED",
  "CLOSED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  INFO_GATHERING: "Info Gathering",
  SUBMITTED: "Submitted",
  UNDER_AGENCY_REVIEW: "Under Agency Review",
  NEEDS_REVISION: "Needs Revision",
  APPROVED: "Approved",
  DENIED: "Denied",
  CLOSED: "Closed",
};

export const STATUS_BADGE_VARIANT: Record<
  ApplicationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  INFO_GATHERING: "secondary",
  SUBMITTED: "secondary",
  UNDER_AGENCY_REVIEW: "default",
  NEEDS_REVISION: "destructive",
  APPROVED: "default",
  DENIED: "destructive",
  CLOSED: "outline",
};
