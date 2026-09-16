import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const ROLES = ["DEVELOPER", "OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"] as const;
export type AppRole = (typeof ROLES)[number];

/** DEVELOPER is a break-glass superuser, same reach as OWNER — see requireRole(). */
export function isSuperuser(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "DEVELOPER";
}

/**
 * OWNER/DEVELOPER inherit every ADMIN permission; ACCOUNTANT also carries
 * full ADMIN permissions everywhere (on top of the Invoices exclusivity
 * below) — check this instead of `role === "ADMIN"`. Takes `string` (not
 * `AppRole`) since it's most often called directly on `session.user.role`,
 * which next-auth types as `string`.
 */
export function isAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "ACCOUNTANT" || isSuperuser(role);
}

/** ADMIN/ACCOUNTANT/MANAGER/OWNER/DEVELOPER — the "management" tier used across visibility and archive checks. */
export function isManagement(role: string | null | undefined): boolean {
  return isAdmin(role) || role === "MANAGER";
}

/**
 * Invoices are ACCOUNTANT-exclusive (plus the OWNER/DEVELOPER superusers) —
 * unlike every other ADMIN-gated feature, plain ADMIN and MANAGER do NOT get
 * this one. See MANAGE_ROLES in src/lib/actions/invoices.ts /
 * invoice-attachments.ts.
 */
export function canAccessInvoices(role: string | null | undefined): boolean {
  return role === "ACCOUNTANT" || isSuperuser(role);
}

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

/**
 * A Caregiver's dashboard is just My Tasks + Clients (see AppSidebarNav) —
 * every other top-level page (Projects, Applications, Time, Invoices,
 * Admin) calls this first so a typed-in URL redirects cleanly instead of
 * crashing into a ForbiddenError from whatever data call comes next.
 */
export async function blockCaregiverRoute(fallback = "/tasks") {
  const session = await auth();
  if (session?.user?.role === "CAREGIVER") redirect(fallback);
}

/**
 * Throws unless the current user's role is one of `allowed`. OWNER and
 * DEVELOPER sit above every role and always pass, including an
 * ACCOUNTANT-exclusive `allowed` list (e.g. Invoices) that doesn't even
 * mention ADMIN. ACCOUNTANT passes any `allowed` list that includes ADMIN —
 * every call site written as ADMIN-gated doesn't need to separately
 * remember ACCOUNTANT.
 */
export async function requireRole(allowed: AppRole[]) {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  if (isSuperuser(role)) return session;
  const permitted = allowed.includes(role) || (role === "ACCOUNTANT" && allowed.includes("ADMIN"));
  if (!permitted) throw new ForbiddenError();
  return session;
}

/**
 * Applications are scoped to their owner or anyone with an Access Grant for
 * STAFF; ADMIN/MANAGER see everything; CLIENT sees only Applications shared
 * with them via Access Grant (clients never own an Application).
 */
export function applicationVisibilityFilter(session: Awaited<ReturnType<typeof requireSession>>) {
  const role = session.user.role as AppRole;
  if (isManagement(role)) return {};
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
  if (isManagement(role)) return "edit";

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
