import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { issueAuthToken } from "@/lib/auth-tokens";
import { orgAppUrl } from "@/lib/tenant-host";
import { UserFacingError } from "@/lib/user-facing-error";

// Moving between workspaces (docs/workspace-tasks-plan.md, Phase 1): a
// managing company's user and their linked accounts in the workspaces they're
// assigned to (src/lib/workspace-assignments.ts). Every workspace is its own
// host with its own session, so a switch is a single-use WORKSPACE_SWITCH
// link — like a platform admin entering a workspace (support-access.ts) —
// issued only to someone already signed in as that person somewhere.
//
// Needs workspace subdomains (ROOT_DOMAIN): in single-tenant mode every
// address is the same workspace, so there's nothing to switch to.

export type SwitchTarget = { slug: string; name: string; home: boolean; current: boolean };

/**
 * Where a switch link may land after signing in: a path in the workspace's
 * projects area only (Phase 5 "Client work" opens a task directly) — never
 * another site or anything else.
 */
export function safeSwitchPath(next: string | null | undefined): string | null {
  if (!next || next.length > 300) return null;
  return /^\/work(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9_=&-]*)?$/.test(next) ? next : null;
}

export function switchingAvailable() {
  return Boolean(process.env.ROOT_DOMAIN?.trim());
}

/** The signed-in user's home user id (themselves, or who their linked account belongs to). */
async function homeUserIdOf(userId: string): Promise<string | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { assignedFromUserId: true, active: true } });
  if (!me || !me.active) return null;
  return me.assignedFromUserId ?? userId;
}

/**
 * Workspaces the signed-in user can switch between: their home workspace and
 * every active assignment. Empty when there's nothing to switch to.
 */
export async function listSwitchTargets(user: { id: string; organizationId: string }): Promise<SwitchTarget[]> {
  if (!switchingAvailable()) return [];
  const homeUserId = await homeUserIdOf(user.id);
  if (!homeUserId) return [];
  const home = await prisma.user.findUnique({
    where: { id: homeUserId },
    select: { active: true, organization: { select: { id: true, slug: true, name: true, status: true } } },
  });
  if (!home?.active || home.organization.status !== "ACTIVE") return [];
  const assignments = await prisma.workspaceAssignment.findMany({
    where: { homeUserId, active: true, org: { status: "ACTIVE" } },
    orderBy: { org: { name: "asc" } },
    select: { org: { select: { id: true, slug: true, name: true } } },
  });
  if (assignments.length === 0) return [];
  return [
    { slug: home.organization.slug, name: home.organization.name, home: true, current: home.organization.id === user.organizationId },
    ...assignments.map(({ org }) => ({ slug: org.slug, name: org.name, home: false, current: org.id === user.organizationId })),
  ];
}

/**
 * Issues a one-time link into workspace `targetSlug` for the signed-in user —
 * their linked account there, or their own account back home. Refuses unless
 * the assignment, the home account and both workspaces are active.
 */
export async function startWorkspaceSwitch(user: { id: string; organizationId: string }, targetSlug: string, next?: string | null): Promise<string> {
  if (!switchingAvailable()) throw new UserFacingError("Switching workspaces needs workspace addresses to be turned on");
  const homeUserId = await homeUserIdOf(user.id);
  if (!homeUserId) throw new UserFacingError("Your account is no longer active");
  const home = await prisma.user.findUnique({
    where: { id: homeUserId },
    select: { id: true, name: true, email: true, active: true, organization: { select: { id: true, slug: true, status: true } } },
  });
  if (!home?.active || home.organization.status !== "ACTIVE") throw new UserFacingError("Your account is no longer active");

  let org: { id: string; slug: string };
  let targetUserId: string;
  if (targetSlug === home.organization.slug) {
    org = home.organization;
    targetUserId = home.id;
  } else {
    const assignment = await prisma.workspaceAssignment.findFirst({
      where: { homeUserId, active: true, org: { slug: targetSlug, status: "ACTIVE" } },
      select: { userId: true, user: { select: { name: true, email: true } }, org: { select: { id: true, slug: true } } },
    });
    if (!assignment) throw new UserFacingError("You're not assigned to that workspace");
    // Keep the linked account's name/email in step with the home account.
    if (assignment.user.name !== home.name || assignment.user.email !== home.email) {
      await prisma.user.update({ where: { id: assignment.userId }, data: { name: home.name, email: home.email } });
    }
    org = assignment.org;
    targetUserId = assignment.userId;
  }
  if (org.id === user.organizationId) throw new UserFacingError("You're already in that workspace");

  const token = await runAsTenant(org, () => issueAuthToken(targetUserId, "WORKSPACE_SWITCH"));
  const landing = safeSwitchPath(next);
  return `${orgAppUrl(org.slug)}/switch/enter?token=${encodeURIComponent(token)}${landing ? `&next=${encodeURIComponent(landing)}` : ""}`;
}

/**
 * Whether a linked account may still be used: its assignment, the home
 * account and the home workspace are all active. Checked at sign-in and
 * every minute of an open session (src/auth.ts).
 */
export async function isLinkedAccountActive(userId: string): Promise<boolean> {
  const row = await prisma.workspaceAssignment.findUnique({
    where: { userId },
    select: { active: true, user: { select: { active: true } }, homeUser: { select: { active: true } }, homeOrg: { select: { status: true } } },
  });
  return Boolean(row?.active && row.user.active && row.homeUser.active && row.homeOrg.status === "ACTIVE");
}
