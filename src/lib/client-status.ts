// Distinct from the existing `active` boolean: `active: false` means
// archived/hidden from the default list, while `status` is the richer
// in-use lifecycle value — a COMPLETED or ON_HOLD client is still "active"
// in the sense of not being archived.
export const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "ON_HOLD", "COMPLETED"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
};

export const CLIENT_STATUS_BADGE_VARIANT: Record<ClientStatus, "default" | "secondary" | "outline"> = {
  PROSPECT: "outline",
  ACTIVE: "default",
  ON_HOLD: "secondary",
  COMPLETED: "secondary",
};
