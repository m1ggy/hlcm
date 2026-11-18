// What a tasks-only workspace (Organization.kind = TASKS, a client company's
// workspace — docs/workspace-tasks-plan.md) can open. Everything else is the
// licensing CRM, which only FULL workspaces have; the proxy (src/auth.ts)
// sends those addresses to the workspace's home page instead. Pure, so the
// proxy can use it.

/** A tasks-only workspace's home page: the client's weekly summary. */
export const TASKS_HOME = "/work/summary";

/**
 * Where to land after signing in. Sign-in redirects come from server
 * actions, which render the target page directly instead of going through
 * the proxy, so "/" in a tasks-only workspace would show the licensing
 * dashboard's 404 rather than being sent on to TASKS_HOME.
 */
export function homePathFor(kind: "FULL" | "TASKS" | null | undefined): string {
  return kind === "TASKS" ? TASKS_HOME : "/";
}

const TASKS_PATHS = [
  "/work",
  "/account",
  "/admin/users",
  "/admin/organization",
  // The shift clock, for the client company's own staff (docs/activity-monitoring-plan.md),
  // with its desktop app pages under /time.
  "/time",
  // The workspace's own forms and their submissions (Forms in the sidebar).
  "/intake",
  // The workspace's own file library (src/lib/workspace-library.ts).
  "/files",
  "/notifications",
  "/accept-terms",
  "/switch",
  "/support",
  "/api",
  "/handbook",
];

const matches = (pathname: string, paths: string[]) => paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function isTasksWorkspacePath(pathname: string): boolean {
  return matches(pathname, TASKS_PATHS);
}

// The CRM's home-care pages, opened in a tasks-only workspace whose platform
// admin turned on clients and caregivers (Organization.careEnabled,
// docs/client-care-plan.md): the office's Clients and Caregivers pages and
// a caregiver's own Today, clients and hours.
const CARE_PATHS = ["/care-recipients", "/caregivers", "/today", "/hours", "/search"];

export function isCarePath(pathname: string): boolean {
  return matches(pathname, CARE_PATHS);
}

type KindedOrg = { kind: "FULL" | "TASKS"; careEnabled?: boolean | null };

/** Whether this workspace has the home-care pages: every full workspace, and a tasks-only one with care turned on. */
export function hasCare(org: KindedOrg): boolean {
  return org.kind === "FULL" || Boolean(org.careEnabled);
}

/**
 * Whether the proxy lets this address through in this workspace, for this
 * person. A caregiver has no projects (workScope gives them nothing), so
 * /work sends them to their own home instead.
 */
export function isWorkspacePathAllowed(org: KindedOrg, pathname: string, role?: string | null): boolean {
  if (org.kind !== "TASKS") return true;
  if (role === "CAREGIVER" && matches(pathname, ["/work", "/intake"])) return false;
  return isTasksWorkspacePath(pathname) || (hasCare(org) && isCarePath(pathname));
}

/**
 * Where to land after signing in, for a given person: a caregiver in a
 * tasks-only workspace with care goes to their Today page, everyone else
 * to the workspace's home.
 */
export function homePathForRole(org: KindedOrg | null | undefined, role: string | null | undefined): string {
  if (org?.kind === "TASKS" && role === "CAREGIVER" && hasCare(org)) return "/today";
  return homePathFor(org?.kind);
}
