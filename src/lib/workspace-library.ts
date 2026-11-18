import { currentOrganization } from "@/lib/db";
import { requireSession, ForbiddenError } from "@/lib/rbac";

// A client workspace's file library (docs/file-management-plan.md): one
// folder tree for the whole workspace, separate from task attachments. Only
// tasks-only workspaces have it (a licensing workspace keeps files on its
// clients and applications). The client company's office staff and the
// managing company's team working there use it; caregivers and client
// portal users don't.

const NO_LIBRARY_ROLES = new Set(["CAREGIVER", "CLIENT"]);

export function canUseLibrary(role: string | null | undefined, orgKind: "FULL" | "TASKS" | null | undefined): boolean {
  return orgKind === "TASKS" && !!role && !NO_LIBRARY_ROLES.has(role);
}

/** Throws ForbiddenError unless the signed-in person can use this workspace's library. */
export async function requireLibraryAccess() {
  const session = await requireSession();
  const org = await currentOrganization();
  if (!canUseLibrary(session.user.role, org.kind)) throw new ForbiddenError("Not accessible");
  return session;
}
