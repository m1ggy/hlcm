import { currentOrganization } from "@/lib/db";
import { isTrackedRole, isSuperuser } from "@/lib/rbac";
import { monitoringPolicyFor } from "@/lib/monitoring-policy";
import type { HostOrg } from "@/lib/tenant";

// Who activity monitoring applies to, per workspace (docs/activity-monitoring-plan.md):
//   - the platform console grants the add-on; the workspace owner switches it on;
//   - it covers the workspace's own people in tracked roles — never a
//     linked account (a managing company's staff working here: they're
//     tracked once, by their own employer, in their home workspace), never
//     a platform support account;
//   - only the workspace's OWNER, or a DEVELOPER, sees anyone else's data.

type MonitoringOrg = Pick<HostOrg, "activityMonitoringAddon" | "activityMonitoringEnabled">;

export function monitoringOn(org: MonitoringOrg): boolean {
  return org.activityMonitoringAddon && org.activityMonitoringEnabled;
}

export type TrackablePerson = { role: string; active: boolean; isSupport: boolean; assignedFromUserId: string | null };

/** Whether this person can be tracked in this workspace (it still has to be switched on). */
export function isTrackablePerson(user: TrackablePerson): boolean {
  return user.active && !user.isSupport && !user.assignedFromUserId && isTrackedRole(user.role);
}

/** OWNER or DEVELOPER: may see everyone's activity in the workspace. */
export function canViewTeamActivity(role: string | null | undefined): boolean {
  return isSuperuser(role);
}

/** The current workspace's monitoring state, for pages and the desktop app. */
export async function currentMonitoring() {
  const org = await currentOrganization();
  return { org, on: monitoringOn(org), addon: org.activityMonitoringAddon, policy: monitoringPolicyFor(org) };
}
