import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { workScope } from "@/lib/work";
import { createProject, createTask, type WorkActor } from "@/lib/work-service";

// Client work in the home workspace: a client's task is timed, opened and
// changed from home, as the person's linked account in that workspace, and
// only one timer of theirs runs at a time across all their workspaces.

const HOME = { id: "org_cwh_home", slug: "cwh-home", name: "CWH Home" };
const CLIENT = { id: "org_cwh_client", slug: "cwh-client", name: "CWH Client" };
const OTHER = { id: "org_cwh_other", slug: "cwh-other", name: "CWH Other" };
let homeUser = "";
let linkedUser = "";
let taskId = "";
let otherTaskId = "";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/storage", () => ({ saveUploadedFile: vi.fn(), deleteStoredFile: vi.fn() }));
// Not importOriginal — the real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => ({
  requireSession: vi.fn(async () => ({ user: { id: homeUser, organizationId: HOME.id, role: "STAFF", isAssigned: false, name: "Sam Staff" } })),
  requireRole: vi.fn(async () => ({ user: { id: homeUser, organizationId: HOME.id, role: "STAFF", isAssigned: false } })),
  isManagement: () => false,
  isAdmin: () => false,
  ForbiddenError: class extends Error {},
  UnauthorizedError: class extends Error {},
}));

const timers = await import("@/lib/actions/task-time-entries");
const actions = await import("@/lib/actions/work");
const atHome = <T,>(fn: () => Promise<T>) => runAsTenant(HOME, fn);
const open = (orgId: string) => tenantDb(orgId).taskTimeEntry.findMany({ where: { endedAt: null } });

beforeAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, OTHER.id, HOME.id] } } });
  await prisma.organization.create({ data: { ...HOME, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...OTHER, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  for (const o of [HOME, CLIENT, OTHER]) forgetOrg(o.slug);
  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@cwh-home.test", passwordHash: "x", role: "ADMIN" } });
  homeUser = (await h.user.create({ data: { name: "Sam Staff", email: "sam@cwh-home.test", passwordHash: "x", role: "STAFF" } })).id;
  const by = { userId: admin.id, orgId: HOME.id, role: "ADMIN" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: homeUser, role: "STAFF", canAssign: false });
  // Ada manages both client workspaces; Sam is only in CLIENT.
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: admin.id, role: "MANAGER", canAssign: true });
  await assignToWorkspace(by, { orgId: OTHER.id, homeUserId: admin.id, role: "MANAGER", canAssign: true });
  linkedUser = (await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "sam@cwh-home.test" } })).id;
  const managerIn = async (orgId: string): Promise<WorkActor> => {
    const id = (await tenantDb(orgId).user.findFirstOrThrow({ where: { email: "ada@cwh-home.test" } })).id;
    return { userId: id, scope: workScope({ userId: id, role: "MANAGER", isAssigned: true, orgKind: "TASKS" }), orgKind: "TASKS" };
  };
  const m1 = await managerIn(CLIENT.id);
  await runAsTenant(CLIENT, async () => {
    const p = await createProject(m1, { name: "Books" });
    taskId = (await createTask(m1, { projectId: p.id, title: "Reconcile October", assigneeIds: [linkedUser] })).task.id;
  });
  const m2 = await managerIn(OTHER.id);
  await runAsTenant(OTHER, async () => {
    const p = await createProject(m2, { name: "Private" });
    otherTaskId = (await createTask(m2, { projectId: p.id, title: "Not yours" })).task.id;
  });
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("the task timer from Client work", () => {
  it("times a client's task in that workspace, clocks in at home, and keeps one timer running", async () => {
    await atHome(() => timers.startTaskTimer({}));
    expect(await open(HOME.id)).toHaveLength(1);

    const started = await atHome(() => timers.startClientTaskTimer(CLIENT.id, taskId));
    expect(started.clockedIn).toBe(false); // already clocked in by the first timer
    expect(await open(HOME.id)).toHaveLength(0);
    const client = await open(CLIENT.id);
    expect(client).toHaveLength(1);
    expect(client[0]).toMatchObject({ userId: linkedUser, workTaskId: taskId });
    expect(await tenantDb(HOME.id).timeEntry.count({ where: { userId: homeUser, clockOut: null } })).toBe(1);

    const shown = await atHome(() => timers.getMyOpenTaskTimer());
    expect(shown).toMatchObject({ orgId: CLIENT.id, workspaceName: CLIENT.name, workTaskId: taskId });

    // Starting a home timer stops the client one.
    await atHome(() => timers.startTaskTimer({}));
    expect(await open(CLIENT.id)).toHaveLength(0);
    expect(await open(HOME.id)).toHaveLength(1);

    // And Stop from home stops a client timer.
    await atHome(() => timers.startClientTaskTimer(CLIENT.id, taskId));
    await atHome(() => timers.stopTaskTimer());
    expect(await open(CLIENT.id)).toHaveLength(0);
    expect(await open(HOME.id)).toHaveLength(0);
  });

  it("refuses a workspace the person isn't assigned to", async () => {
    await expect(atHome(() => timers.startClientTaskTimer(OTHER.id, otherTaskId))).rejects.toThrow("no longer assigned");
  });
});

describe("the task panel from Client work", () => {
  it("reads and changes a client's task as the linked account, and nothing outside the person's workspaces", async () => {
    const detail = await atHome(() => actions.getTaskDetailAction(taskId, CLIENT.id));
    expect(detail.ok && detail.data.title).toBe("Reconcile October");

    const r = await atHome(() => actions.updateTaskAction(taskId, { status: "IN_PROGRESS" }, CLIENT.id));
    expect(r.ok).toBe(true);
    expect((await tenantDb(CLIENT.id).workTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("IN_PROGRESS");

    const c = await atHome(() => actions.addCommentAction(taskId, { body: "Started on the bank feed", visibility: "INTERNAL" }, CLIENT.id));
    expect(c.ok).toBe(true);
    expect(await tenantDb(CLIENT.id).workTaskComment.count({ where: { taskId, authorId: linkedUser } })).toBe(1);

    const ctx = await atHome(() => actions.linkedTaskContextAction(CLIENT.id));
    expect(ctx.ok && ctx.data.currentUserId).toBe(linkedUser);

    const other = await atHome(() => actions.getTaskDetailAction(otherTaskId, OTHER.id));
    expect(other).toEqual({ ok: false, error: "You're no longer assigned to that workspace" });
  });
});
