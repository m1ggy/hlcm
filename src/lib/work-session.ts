import { notFound } from "next/navigation";
import { currentOrganization } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { workScope } from "@/lib/work";

/** The signed-in viewer's side and permissions for /work pages; 404 for people with no access (caregivers). */
export async function requireWorkViewer() {
  const session = await requireSession();
  const org = await currentOrganization();
  const viewer = { userId: session.user.id, role: session.user.role, isAssigned: Boolean(session.user.isAssigned), orgKind: org.kind };
  const scope = workScope(viewer);
  if (scope.side === "none") notFound();
  return { viewer, scope, org };
}
