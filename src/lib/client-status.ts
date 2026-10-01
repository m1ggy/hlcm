// Distinct from the existing `active` boolean: `active: false` means
// archived/hidden from the default list, while `status` is the richer
// in-use lifecycle value — a CLOSED or ON_HOLD client is still "active"
// in the sense of not being archived.
// The statuses staff can pick. COMPLETED is the pre-CLOSED value, migrated
// away (20261001150100_client_status_closed) but still in the DB enum for
// one release — it keeps a label below so old audit rows still read, but is
// never offered as a choice.
export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "ON_HOLD", "INACTIVE", "CLOSED"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number] | "COMPLETED";

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  INACTIVE: "Inactive",
  CLOSED: "Closed",
  COMPLETED: "Closed",
};

export const CLIENT_STATUS_DESCRIPTIONS: Record<(typeof CLIENT_STATUSES)[number], string> = {
  PROSPECT: "Potential client; no services have started yet.",
  ACTIVE: "Receiving at least one active service.",
  ON_HOLD: "Relationship temporarily paused; the record stays active.",
  INACTIVE: "No current services, kept for history.",
  CLOSED: "Relationship has ended.",
};

export const CLIENT_STATUS_BADGE_VARIANT: Record<ClientStatus, "default" | "secondary" | "outline"> = {
  PROSPECT: "outline",
  ACTIVE: "default",
  ON_HOLD: "secondary",
  INACTIVE: "outline",
  CLOSED: "secondary",
  COMPLETED: "secondary",
};
