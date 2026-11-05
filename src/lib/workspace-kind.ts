// What a tasks-only workspace (Organization.kind = TASKS, a client company's
// workspace — docs/workspace-tasks-plan.md) can open. Everything else is the
// licensing CRM, which only FULL workspaces have; the proxy (src/auth.ts)
// sends those addresses to the workspace's home page instead. Pure, so the
// proxy can use it.

/** A tasks-only workspace's home page (projects, tasks, weekly summary). */
export const TASKS_HOME = "/work";

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
