import type { ClientStatus } from "@/lib/client-status";

// Lifecycle of one ClientService — see ServiceStatus in prisma/schema.prisma.
export const SERVICE_STATUSES = ["PENDING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "EXPIRED"] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const SERVICE_STATUS_DESCRIPTIONS: Record<ServiceStatus, string> = {
  PENDING: "Approved or created, not started yet.",
  ACTIVE: "Currently being provided.",
  ON_HOLD: "Temporarily paused.",
  COMPLETED: "Finished successfully.",
  CANCELLED: "Stopped before completion.",
  EXPIRED: "Reached its end/renewal date and wasn't renewed.",
};

// Same palette as the Services mockup: green active, amber on hold, muted
// for anything finished.
export const SERVICE_STATUS_CLASS: Record<ServiceStatus, string> = {
  PENDING: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

// A service that's still part of the relationship — not finished one way or
// another. ON_HOLD counts: a paused service isn't a lapsed client.
const OPEN_SERVICE_STATUSES: ReadonlySet<ServiceStatus> = new Set(["PENDING", "ACTIVE", "ON_HOLD"]);

/**
 * What a client's status should become after one of its services changed,
 * or null to leave it alone:
 * - any ACTIVE service, client Prospect/Inactive → Active
 * - no open (pending/active/on hold) service, client Active → Inactive
 * ON_HOLD and CLOSED clients are a person's call and never changed here,
 * and closing a service never closes the client.
 * Archived services (`active: false`) don't count.
 */
export function suggestClientStatus(
  current: ClientStatus,
  services: { status: ServiceStatus; active: boolean }[]
): ClientStatus | null {
  const live = services.filter((s) => s.active);
  if ((current === "PROSPECT" || current === "INACTIVE") && live.some((s) => s.status === "ACTIVE")) {
    return "ACTIVE";
  }
  if (current === "ACTIVE" && !live.some((s) => OPEN_SERVICE_STATUSES.has(s.status))) {
    return "INACTIVE";
  }
  return null;
}
