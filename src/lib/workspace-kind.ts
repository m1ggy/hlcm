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
  "/notifications",
  "/accept-terms",
  "/switch",
  "/support",
  "/api",
  "/handbook",
];

export function isTasksWorkspacePath(pathname: string): boolean {
  return TASKS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
