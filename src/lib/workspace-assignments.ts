import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { forgetOrg } from "@/lib/tenant";
import { UserFacingError } from "@/lib/user-facing-error";

// A managing company (e.g. CTK) putting its own people to work in its client
// companies' workspaces (docs/workspace-tasks-plan.md, Phase 1).
//
// Each assigned person gets a linked account in the client workspace
// (User.assignedFromUserId = their home user id) and a WorkspaceAssignment
// row tying the two together. The linked account is a normal user there —
// tasks, comments and audit entries carry it — but it can't sign in with a
// password (only through the switcher, src/lib/workspace-switch.ts), and the
// client's own admins can't edit or remove it.
//
// Who may assign: the managing workspace's OWNER / ADMIN / DEVELOPER, for
// every workspace it manages, and account managers (an assignment with
// canAssign) for the workspaces they manage — staff only.
//
// Cross-org by nature, so this uses the system client (see the ESLint
// allowlist). Callers pass the signed-in actor from their own session.

export type AssignmentActor = {
  userId: string;
  orgId: string;
  role: string;
  name?: string | null;
  /**
   * A platform admin acting for the managing company (the create wizard in
   * the platform console). They have no account in it, so `userId` is theirs
   * from the platform org and the managing side's audit entry is recorded on
   * the assigned person instead.
   */
  viaPlatform?: boolean;
};

export type AssignableRole = "STAFF" | "MANAGER";
const ASSIGNABLE_ROLES: AssignableRole[] = ["STAFF", "MANAGER"];

/** OWNER / ADMIN / DEVELOPER of the managing workspace — may assign anyone, name account managers. */
// (Same as rbac's isSuperuser() || ADMIN — not imported from there, since
// rbac pulls in next-auth and this module is also used outside requests.)
export function isWorkspaceAdmin(role: string | null | undefined) {
  return role === "OWNER" || role === "DEVELOPER" || role === "ADMIN";
}

type Access = { org: { id: string; slug: string; name: string }; level: "admin" | "accountManager" };

async function accessTo(actor: AssignmentActor, orgId: string): Promise<Access> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, slug: true, name: true, status: true, managedByOrgId: true },
  });
  if (!org || org.managedByOrgId !== actor.orgId) throw new UserFacingError("That workspace isn't managed by yours");
  if (actor.viaPlatform || isWorkspaceAdmin(actor.role)) return { org, level: "admin" };
  const mine = await prisma.workspaceAssignment.findFirst({
    where: { homeUserId: actor.userId, orgId, active: true, canAssign: true },
    select: { id: true },
  });
  if (!mine) throw new UserFacingError("Only admins and that workspace's account managers can assign people to it");
  return { org, level: "accountManager" };
}

export type ManagedWorkspace = {
  id: string;
  slug: string;
  name: string;
  kind: "FULL" | "TASKS";
  status: "ACTIVE" | "SUSPENDED";
  /** "admin": every action; "accountManager": staff only. */
  level: "admin" | "accountManager";
  assignedCount: number;
};

/** The workspaces `actor` may assign people to: all of their org's for admins, else the ones they're account manager of. */
export async function listManagedWorkspaces(actor: AssignmentActor): Promise<ManagedWorkspace[]> {
  const admin = isWorkspaceAdmin(actor.role);
  const orgs = await prisma.organization.findMany({
    where: {
      managedByOrgId: actor.orgId,
      ...(admin ? {} : { assignmentsIn: { some: { homeUserId: actor.userId, active: true, canAssign: true } } }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      status: true,
      _count: { select: { assignmentsIn: { where: { active: true } } } },
    },
  });
  return orgs.map(({ _count, ...org }) => ({ ...org, level: admin ? "admin" : "accountManager", assignedCount: _count.assignmentsIn }));
}

/** Whether `actor` should see the Client workspaces page at all. */
export async function canManageAnyWorkspace(actor: AssignmentActor): Promise<boolean> {
  const where = isWorkspaceAdmin(actor.role)
    ? { managedByOrgId: actor.orgId }
    : { managedByOrgId: actor.orgId, assignmentsIn: { some: { homeUserId: actor.userId, active: true, canAssign: true } } };
  return (await prisma.organization.count({ where })) > 0;
}

export type AssignmentRow = {
  id: string;
  homeUserId: string;
  name: string;
  email: string;
  role: string;
  canAssign: boolean;
  active: boolean;
  createdAt: Date;
  endedAt: Date | null;
};

/** People assigned to `orgId` (current first, then ended). */
export async function listAssignments(actor: AssignmentActor, orgId: string): Promise<AssignmentRow[]> {
  await accessTo(actor, orgId);
  const rows = await prisma.workspaceAssignment.findMany({
    where: { orgId, homeOrgId: actor.orgId },
    orderBy: [{ active: "desc" }, { homeUser: { name: "asc" } }],
    select: {
      id: true,
      homeUserId: true,
      role: true,
      canAssign: true,
      active: true,
      createdAt: true,
      endedAt: true,
      homeUser: { select: { name: true, email: true } },
    },
  });
  return rows.map(({ homeUser, ...row }) => ({ ...row, name: homeUser.name, email: homeUser.email }));
}

/** The managing workspace's people who could be assigned (active, real accounts; not clients or caregivers). */
export async function listAssignableStaff(actor: AssignmentActor) {
  return prisma.user.findMany({
    where: {
      organizationId: actor.orgId,
      active: true,
      isSupport: false,
      assignedFromUserId: null,
      role: { notIn: ["CLIENT", "CAREGIVER"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

export type AssignInput = { orgId: string; homeUserId: string; role: AssignableRole; canAssign: boolean };

/**
 * Assigns a managing-company user to a workspace: creates (or reactivates
 * and refreshes) their linked account there and the assignment. Returns the
 * assignment id.
 */
export async function assignToWorkspace(actor: AssignmentActor, input: AssignInput): Promise<string> {
  const { org, level } = await accessTo(actor, input.orgId);
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new UserFacingError("Pick Staff or Manager");
  if (level !== "admin" && (input.role !== "STAFF" || input.canAssign)) {
    throw new UserFacingError("Account managers can only assign staff — ask an admin to add a manager");
  }

  const home = await prisma.user.findFirst({
    where: { id: input.homeUserId, organizationId: actor.orgId, active: true, isSupport: false, assignedFromUserId: null },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!home || home.role === "CLIENT" || home.role === "CAREGIVER") throw new UserFacingError("That person can't be assigned");

  const existing = await prisma.workspaceAssignment.findUnique({
    where: { homeUserId_orgId: { homeUserId: home.id, orgId: org.id } },
    select: { id: true, userId: true, canAssign: true, role: true },
  });
  // An account manager can't change what an admin set up for someone.
  if (existing && level !== "admin" && (existing.canAssign || existing.role !== "STAFF")) {
    throw new UserFacingError("Only an admin can change a manager's assignment");
  }

  if (!existing) {
    const clash = await prisma.user.findFirst({
      where: { organizationId: org.id, email: { equals: home.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (clash) throw new UserFacingError(`${org.name} already has its own account with ${home.email}`);
  }

  const assignmentId = await prisma.$transaction(async (tx) => {
    let linkedUserId = existing?.userId;
    if (linkedUserId) {
      await tx.user.update({ where: { id: linkedUserId }, data: { name: home.name, email: home.email, role: input.role, active: true } });
    } else {
      const linked = await tx.user.create({
        data: {
          organizationId: org.id,
          name: home.name,
          email: home.email,
          role: input.role,
          assignedFromUserId: home.id,
          // Never used: linked accounts only sign in through the switcher.
          passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
        },
        select: { id: true },
      });
      linkedUserId = linked.id;
    }
    const row = await tx.workspaceAssignment.upsert({
      where: { homeUserId_orgId: { homeUserId: home.id, orgId: org.id } },
      create: {
        homeOrgId: actor.orgId,
        homeUserId: home.id,
        orgId: org.id,
        userId: linkedUserId,
        role: input.role,
        canAssign: input.canAssign,
        assignedById: actor.userId,
      },
      update: { role: input.role, canAssign: input.canAssign, active: true, endedAt: null, assignedById: actor.userId },
      select: { id: true, userId: true },
    });
    return row;
  });

  const detail = { workspace: org.slug, person: home.email, role: input.role, accountManager: input.canAssign };
  await auditBoth(actor, org, assignmentId.userId, existing ? "workspace_assignment_updated" : "workspace_assigned", detail, home.id);
  return assignmentId.id;
}

/** Ends an assignment: the linked account is deactivated (its history stays). */
export async function endAssignment(actor: AssignmentActor, assignmentId: string) {
  const row = await prisma.workspaceAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, orgId: true, homeOrgId: true, userId: true, role: true, canAssign: true, active: true, homeUser: { select: { email: true } } },
  });
  if (!row || row.homeOrgId !== actor.orgId) throw new UserFacingError("Assignment not found");
  const { org, level } = await accessTo(actor, row.orgId);
  if (level !== "admin" && (row.canAssign || row.role !== "STAFF")) {
    throw new UserFacingError("Only an admin can remove a manager");
  }
  if (!row.active) return;
  await prisma.$transaction([
    prisma.workspaceAssignment.update({ where: { id: row.id }, data: { active: false, endedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { active: false } }),
  ]);
  await auditBoth(actor, org, row.userId, "workspace_unassigned", { workspace: org.slug, person: row.homeUser.email });
}

/** Ends every assignment of a home user — when they're deactivated in their own workspace. */
export async function endAssignmentsForHomeUser(homeUserId: string) {
  const rows = await prisma.workspaceAssignment.findMany({ where: { homeUserId, active: true }, select: { id: true, userId: true } });
  if (rows.length === 0) return 0;
  await prisma.$transaction([
    prisma.workspaceAssignment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { active: false, endedAt: new Date() } }),
    prisma.user.updateMany({ where: { id: { in: rows.map((r) => r.userId) } }, data: { active: false } }),
  ]);
  return rows.length;
}

/** Who manages the current workspace, for the client side's "from <company>" labels. */
export type LinkedWorkspace = { orgId: string; slug: string; name: string; linkedUserId: string; role: string };

/**
 * The client workspaces `homeUserId` is actively assigned to, with their
 * linked account in each — for reading their work there from home
 * (src/lib/work-everywhere.ts, workspace tasks Phase 5).
 */
export async function listLinkedWorkspaces(homeUserId: string): Promise<LinkedWorkspace[]> {
  const rows = await prisma.workspaceAssignment.findMany({
    where: { homeUserId, active: true, org: { status: "ACTIVE" }, user: { active: true }, homeUser: { active: true } },
    orderBy: { org: { name: "asc" } },
    select: { userId: true, role: true, org: { select: { id: true, slug: true, name: true } } },
  });
  return rows.map((r) => ({ orgId: r.org.id, slug: r.org.slug, name: r.org.name, linkedUserId: r.userId, role: r.role }));
}

export async function managingOrgName(orgId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { managedBy: { select: { name: true } } } });
  return org?.managedBy?.name ?? null;
}

// Logged in both workspaces: the managing one under the actor, the client
// one on the linked account (the actor has no account there), naming who did it.
async function auditBoth(
  actor: AssignmentActor,
  org: { id: string; slug: string },
  linkedUserId: string,
  action: string,
  detail: Record<string, unknown>,
  homeUserId?: string
) {
  const home = await prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { id: true, slug: true, name: true } });
  const homeActorId = actor.viaPlatform && homeUserId ? homeUserId : actor.userId;
  const by = actor.viaPlatform ? `${actor.name ?? "A platform admin"} (platform console)` : `${actor.name ?? "An admin"} (${home.name})`;
  await runAsTenant({ id: home.id, slug: home.slug }, () =>
    recordAudit({
      entityType: "WorkspaceAssignment",
      entityId: org.id,
      action,
      actorId: homeActorId,
      newValue: actor.viaPlatform ? { ...detail, by } : detail,
    })
  );
  await runAsTenant({ id: org.id, slug: org.slug }, () =>
    recordAudit({
      entityType: "User",
      entityId: linkedUserId,
      action,
      actorId: linkedUserId,
      newValue: { ...detail, by },
    })
  );
}

/** Platform console: a workspace's kind and managing company. */
export async function setWorkspaceSetup(orgId: string, input: { kind: "FULL" | "TASKS"; managedByOrgId: string | null }) {
  if (input.managedByOrgId === orgId) throw new UserFacingError("A workspace can't manage itself");
  if (input.managedByOrgId) {
    const manager = await prisma.organization.findUnique({ where: { id: input.managedByOrgId }, select: { slug: true, managedByOrgId: true } });
    if (!manager || manager.slug === "platform") throw new UserFacingError("Pick a workspace as the managing company");
    if (manager.managedByOrgId) throw new UserFacingError("A managed workspace can't manage others");
  }
  const org = await prisma.organization.update({ where: { id: orgId }, data: input, select: { slug: true } });
  forgetOrg(org.slug);
}
