import { currentOrganization } from "@/lib/db";
import { ForbiddenError, requireRole, type AppRole } from "@/lib/rbac";
import { hasCare } from "@/lib/workspace-kind";

// The home-care side (care recipients, caregivers, visits) exists in every
// full workspace and in a tasks-only one whose platform admin turned on
// clients and caregivers (Organization.careEnabled, docs/client-care-plan.md).
// The pages are already hidden elsewhere; this keeps the actions shut too.

export async function requireCareWorkspace() {
  const org = await currentOrganization();
  if (!hasCare(org)) throw new ForbiddenError("Clients and caregivers aren't turned on for this workspace");
  return org;
}

/** requireRole, in a workspace that has the home-care side. */
export async function requireCareRole(allowed: AppRole[]) {
  const session = await requireRole(allowed);
  await requireCareWorkspace();
  return session;
}

/** Who runs the office side of care (clients, caregivers, schedules) — the roles care actions accept. */
export const CARE_OFFICE_ROLES: AppRole[] = ["OWNER", "DEVELOPER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF"];

export function canManageCare(role: string | null | undefined): boolean {
  return CARE_OFFICE_ROLES.includes(role as AppRole);
}
