import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const ROLES = ["ADMIN", "MANAGER", "STAFF", "CLIENT"] as const;
export type AppRole = (typeof ROLES)[number];

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not permitted") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws if there's no session. Use at the top of every server action / route handler. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session;
}

/** Throws unless the current user's role is one of `allowed`. */
export async function requireRole(allowed: AppRole[]) {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  if (!allowed.includes(role)) throw new ForbiddenError();
  return session;
}

/**
 * Applications are scoped to their owner or anyone with an Access Grant for
 * STAFF; ADMIN/MANAGER see everything; CLIENT sees only Applications shared
 * with them via Access Grant (clients never own an Application).
 */
export function applicationVisibilityFilter(session: Awaited<ReturnType<typeof requireSession>>) {
  const role = session.user.role as AppRole;
  if (role === "ADMIN" || role === "MANAGER") return {};
  if (role === "STAFF") {
    return {
      OR: [
        { assignedUserId: session.user.id },
        { accessGrants: { some: { userId: session.user.id } } },
      ],
    };
  }
  return { accessGrants: { some: { userId: session.user.id } } };
}

export type ApplicationAccessLevel = "none" | "view" | "edit";

/**
 * Single source of truth for "can this user see/edit this Application" —
 * owner and ADMIN/MANAGER get edit; an Access Grant gives view or edit per
 * its `permission`; everyone else gets none.
 */
export async function getApplicationAccessLevel(
  session: Awaited<ReturnType<typeof requireSession>>,
  applicationId: string
): Promise<ApplicationAccessLevel> {
  const role = session.user.role as AppRole;
  if (role === "ADMIN" || role === "MANAGER") return "edit";

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { assignedUserId: true },
  });
  if (!app) return "none";
  if (app.assignedUserId === session.user.id) return "edit";

  const grant = await prisma.accessGrant.findUnique({
    where: { applicationId_userId: { applicationId, userId: session.user.id } },
  });
  if (!grant) return "none";
  return grant.permission === "EDIT" ? "edit" : "view";
}

/** Throws unless the current user has at least `need` access to the Application. */
export async function assertApplicationAccess(
  session: Awaited<ReturnType<typeof requireSession>>,
  applicationId: string,
  need: "view" | "edit"
) {
  const level = await getApplicationAccessLevel(session, applicationId);
  if (level === "none") throw new ForbiddenError();
  if (need === "edit" && level !== "edit") throw new ForbiddenError("View-only access");
}
