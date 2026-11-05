import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { consumeAuthToken } from "@/lib/auth-tokens";
import {
  assignToWorkspace,
  endAssignment,
  endAssignmentsForHomeUser,
  listAssignments,
  listManagedWorkspaces,
  setWorkspaceSetup,
  type AssignmentActor,
} from "@/lib/workspace-assignments";
import { isLinkedAccountActive, listSwitchTargets, startWorkspaceSwitch } from "@/lib/workspace-switch";

// A managing company assigning its people to client workspaces through
// linked accounts, and switching between them (docs/workspace-tasks-plan.md).

const HOME = { id: "org_wa_home", slug: "wa-home", name: "Managing Co" };
const CLIENT = { id: "org_wa_client", slug: "wa-client", name: "Client Co" };
const OTHER = { id: "org_wa_other", slug: "wa-other", name: "Other Co" };

let admin: AssignmentActor;
let manager: AssignmentActor;
let vaId = "";
let va2Id = "";

const originalRoot = process.env.ROOT_DOMAIN;

beforeAll(async () => {
  process.env.ROOT_DOMAIN = "example.test";
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, OTHER.id, HOME.id] } } });
  await prisma.organization.create({ data: HOME });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id } });
  // Not managed by HOME: off limits.
  await prisma.organization.create({ data: OTHER });
  for (const o of [HOME, CLIENT, OTHER]) forgetOrg(o.slug);

  const t = tenantDb(HOME.id);
  const a = await t.user.create({ data: { name: "Ada Admin", email: "ada@home.test", passwordHash: "x", role: "ADMIN" } });
  const m = await t.user.create({ data: { name: "Mo Manager", email: "mo@home.test", passwordHash: "x", role: "STAFF" } });
  vaId = (await t.user.create({ data: { name: "Val VA", email: "val@home.test", passwordHash: "x", role: "STAFF" } })).id;
  va2Id = (await t.user.create({ data: { name: "Vic VA", email: "vic@home.test", passwordHash: "x", role: "STAFF" } })).id;
  await tenantDb(CLIENT.id).user.create({ data: { name: "Cat Client", email: "cat@client.test", passwordHash: "x", role: "OWNER" } });

  admin = { userId: a.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" };
  manager = { userId: m.id, orgId: HOME.id, role: "STAFF", name: "Mo Manager" };
});

afterAll(async () => {
  process.env.ROOT_DOMAIN = originalRoot;
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("assigning people to client workspaces", () => {
  it("admins see the workspaces their org manages, nothing else", async () => {
    expect((await listManagedWorkspaces(admin)).map((w) => w.slug)).toEqual([CLIENT.slug]);
    // Plain staff with no account-manager role: none.
    expect(await listManagedWorkspaces(manager)).toEqual([]);
    await expect(assignToWorkspace(admin, { orgId: OTHER.id, homeUserId: vaId, role: "STAFF", canAssign: false })).rejects.toThrow(/managed by yours/);
  });

  it("an admin names an account manager, who can then assign staff only", async () => {
    await assignToWorkspace(admin, { orgId: CLIENT.id, homeUserId: manager.userId, role: "MANAGER", canAssign: true });
    expect((await listManagedWorkspaces(manager)).map((w) => [w.slug, w.level])).toEqual([[CLIENT.slug, "accountManager"]]);

    await expect(assignToWorkspace(manager, { orgId: CLIENT.id, homeUserId: vaId, role: "MANAGER", canAssign: false })).rejects.toThrow(/only assign staff/);
    await assignToWorkspace(manager, { orgId: CLIENT.id, homeUserId: vaId, role: "STAFF", canAssign: false });

    const rows = await listAssignments(admin, CLIENT.id);
    expect(rows.map((r) => [r.email, r.role, r.canAssign, r.active])).toEqual([
      ["mo@home.test", "MANAGER", true, true],
      ["val@home.test", "STAFF", false, true],
    ]);
  });

  it("creates a linked account in the client workspace that the client can see but that has no password sign-in", async () => {
    const linked = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    expect(linked).toMatchObject({ name: "Val VA", role: "STAFF", active: true, assignedFromUserId: vaId });
    // It shows up in the client's user lists (unlike support accounts).
    expect(await tenantDb(CLIENT.id).user.count()).toBe(3);
    // The managing workspace's audit log names the actor.
    const log = await tenantDb(HOME.id).auditLog.findFirst({ where: { action: "workspace_assigned", actorId: manager.userId } });
    expect(log?.newValue).toContain("val@home.test");
  });

  it("an account manager can't remove a manager; an admin can, and the linked account is switched off", async () => {
    const rows = await listAssignments(admin, CLIENT.id);
    const mo = rows.find((r) => r.email === "mo@home.test")!;
    await expect(endAssignment(manager, mo.id)).rejects.toThrow(/Only an admin/);

    const val = rows.find((r) => r.email === "val@home.test")!;
    await endAssignment(manager, val.id);
    const linked = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    expect(linked.active).toBe(false);
    expect(await isLinkedAccountActive(linked.id)).toBe(false);

    // Re-assigning brings the same account back.
    await assignToWorkspace(admin, { orgId: CLIENT.id, homeUserId: vaId, role: "STAFF", canAssign: false });
    const again = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    expect(again.id).toBe(linked.id);
    expect(again.active).toBe(true);
  });

  it("refuses an email the client workspace already uses for its own account", async () => {
    await tenantDb(CLIENT.id).user.create({ data: { name: "Vic (client's own)", email: "vic@home.test", passwordHash: "x" } });
    await expect(assignToWorkspace(admin, { orgId: CLIENT.id, homeUserId: va2Id, role: "STAFF", canAssign: false })).rejects.toThrow(/already has its own account/);
  });

  it("the database refuses a linked account in the wrong workspace", async () => {
    const homeUser = await tenantDb(HOME.id).user.findFirstOrThrow({ where: { email: "ada@home.test" } });
    await expect(
      prisma.workspaceAssignment.create({ data: { homeOrgId: HOME.id, homeUserId: va2Id, orgId: CLIENT.id, userId: homeUser.id } })
    ).rejects.toThrow(/not a linked account/);
  });
});

describe("switching workspaces", () => {
  it("lists home + assigned workspaces, from either side", async () => {
    const fromHome = await listSwitchTargets({ id: vaId, organizationId: HOME.id });
    expect(fromHome.map((t) => [t.slug, t.home, t.current])).toEqual([
      [HOME.slug, true, true],
      [CLIENT.slug, false, false],
    ]);
    const linked = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    const fromClient = await listSwitchTargets({ id: linked.id, organizationId: CLIENT.id });
    expect(fromClient.map((t) => [t.slug, t.current])).toEqual([
      [HOME.slug, false],
      [CLIENT.slug, true],
    ]);
    // Someone with no assignments has nothing to switch to.
    expect(await listSwitchTargets({ id: va2Id, organizationId: HOME.id })).toEqual([]);
  });

  it("issues a one-time link for the linked account, usable only as a switch, only on its workspace", async () => {
    const url = new URL(await startWorkspaceSwitch({ id: vaId, organizationId: HOME.id }, CLIENT.slug));
    expect(url.origin).toBe("https://wa-client.example.test");
    expect(url.pathname).toBe("/switch/enter");
    const token = url.searchParams.get("token")!;

    // Not on another workspace's host…
    expect(await runAsTenant(HOME, () => consumeAuthToken(token, ["WORKSPACE_SWITCH"]))).toBeNull();
    await runAsTenant(CLIENT, async () => {
      // …not as a password link…
      expect(await consumeAuthToken(token)).toBeNull();
      // …once.
      const used = await consumeAuthToken(token, ["WORKSPACE_SWITCH"]);
      const linked = await tenantDb(CLIENT.id).user.findUniqueOrThrow({ where: { id: used!.userId } });
      expect(linked.assignedFromUserId).toBe(vaId);
      expect(await consumeAuthToken(token, ["WORKSPACE_SWITCH"])).toBeNull();
    });
  });

  it("switches back home as the home account", async () => {
    const linked = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    const url = new URL(await startWorkspaceSwitch({ id: linked.id, organizationId: CLIENT.id }, HOME.slug));
    const token = url.searchParams.get("token")!;
    const used = await runAsTenant(HOME, () => consumeAuthToken(token, ["WORKSPACE_SWITCH"]));
    expect(used?.userId).toBe(vaId);
  });

  it("refuses workspaces you're not assigned to, and stops once the home account is deactivated", async () => {
    await expect(startWorkspaceSwitch({ id: vaId, organizationId: HOME.id }, OTHER.slug)).rejects.toThrow(/not assigned/);

    const linked = await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@home.test" } });
    expect(await isLinkedAccountActive(linked.id)).toBe(true);
    await prisma.user.update({ where: { id: vaId }, data: { active: false } });
    expect(await isLinkedAccountActive(linked.id)).toBe(false);
    await expect(startWorkspaceSwitch({ id: linked.id, organizationId: CLIENT.id }, HOME.slug)).rejects.toThrow(/no longer active/);
    expect(await endAssignmentsForHomeUser(vaId)).toBe(1);
    expect((await tenantDb(CLIENT.id).user.findUniqueOrThrow({ where: { id: linked.id } })).active).toBe(false);
  });

  it("is off in single-tenant mode", async () => {
    process.env.ROOT_DOMAIN = "";
    expect(await listSwitchTargets({ id: manager.userId, organizationId: HOME.id })).toEqual([]);
    await expect(startWorkspaceSwitch({ id: manager.userId, organizationId: HOME.id }, CLIENT.slug)).rejects.toThrow(/workspace addresses/);
    process.env.ROOT_DOMAIN = "example.test";
  });
});

describe("console setup", () => {
  it("a workspace can't manage itself or be managed by a managed workspace", async () => {
    await expect(setWorkspaceSetup(HOME.id, { kind: "FULL", managedByOrgId: HOME.id })).rejects.toThrow(/itself/);
    await expect(setWorkspaceSetup(OTHER.id, { kind: "TASKS", managedByOrgId: CLIENT.id })).rejects.toThrow(/can't manage others/);
    await setWorkspaceSetup(OTHER.id, { kind: "TASKS", managedByOrgId: HOME.id });
    expect((await listManagedWorkspaces(admin)).map((w) => w.slug)).toEqual([CLIENT.slug, OTHER.slug]);
  });
});

describe("tasks-only workspaces", () => {
  it("only open their own pages; licensing addresses aren't among them", async () => {
    const { isTasksWorkspacePath } = await import("@/lib/workspace-kind");
    for (const p of ["/work", "/work/abc", "/account", "/admin/users", "/admin/organization", "/switch/enter", "/api/auth/session"]) {
      expect(isTasksWorkspacePath(p), p).toBe(true);
    }
    for (const p of ["/", "/clients", "/applications/1", "/admin", "/admin/license-types", "/invoices", "/portal", "/workflows"]) {
      expect(isTasksWorkspacePath(p), p).toBe(false);
    }
  });
});
