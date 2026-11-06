import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { workScope, type WorkViewer } from "@/lib/work";
import { getProject, getTaskDetail, listMyWorkTasks, listProjects, listProjectActivity } from "@/lib/work-data";
import {
  addComment,
  createProject,
  createTask,
  declineRequest,
  moveTask,
  requestTask,
  setAssignees,
  updateTask,
  type WorkActor,
} from "@/lib/work-service";

// Projects and tasks in a client company's workspace (docs/workspace-tasks-plan.md,
// Phase 2): the managing company's assigned staff work on them, the client's
// own people see only what's meant for them.

const HOME = { id: "org_wp_home", slug: "wp-home", name: "Managing Co" };
const CLIENT = { id: "org_wp_client", slug: "wp-client", name: "Client Co" };

let manager: WorkActor; // linked account, MANAGER
let va: WorkActor; // linked account, STAFF
let owner: WorkActor; // the client's own OWNER
let vaId = "";
let ownerId = "";
let managerId = "";

function actor(userId: string, viewer: Omit<WorkViewer, "userId">): WorkActor {
  return { userId, scope: workScope({ userId, ...viewer }), orgKind: viewer.orgKind };
}
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id] } } });
  await prisma.organization.create({ data: HOME });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id } });
  for (const o of [HOME, CLIENT]) forgetOrg(o.slug);

  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@wp-home.test", passwordHash: "x", role: "ADMIN" } });
  const m = await h.user.create({ data: { name: "Mo Manager", email: "mo@wp-home.test", passwordHash: "x", role: "STAFF" } });
  const v = await h.user.create({ data: { name: "Val VA", email: "val@wp-home.test", passwordHash: "x", role: "STAFF" } });
  ownerId = (await tenantDb(CLIENT.id).user.create({ data: { name: "Cat Client", email: "cat@wp-client.test", passwordHash: "x", role: "OWNER" } })).id;

  const by = { userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: m.id, role: "MANAGER", canAssign: true });
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: v.id, role: "STAFF", canAssign: false });
  const c = tenantDb(CLIENT.id);
  managerId = (await c.user.findFirstOrThrow({ where: { email: "mo@wp-home.test" } })).id;
  vaId = (await c.user.findFirstOrThrow({ where: { email: "val@wp-home.test" } })).id;

  manager = actor(managerId, { role: "MANAGER", isAssigned: true, orgKind: "TASKS" });
  va = actor(vaId, { role: "STAFF", isAssigned: true, orgKind: "TASKS" });
  owner = actor(ownerId, { role: "OWNER", isAssigned: false, orgKind: "TASKS" });
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("who is on which side", () => {
  it("in a client's workspace, its own owner is client-side and the managing company's people are the team", () => {
    expect(owner.scope).toMatchObject({ side: "client", canEditTasks: false, canSeeInternal: false, canRequestTasks: true });
    expect(manager.scope).toMatchObject({ side: "team", canManageProjects: true, canSeeInternal: true });
    expect(va.scope).toMatchObject({ side: "team", canManageProjects: false, canEditTasks: true });
  });

  it("in a full workspace, CLIENT users are client-side and caregivers have no access", () => {
    expect(workScope({ userId: "x", role: "CLIENT", isAssigned: false, orgKind: "FULL" }).side).toBe("client");
    expect(workScope({ userId: "x", role: "STAFF", isAssigned: false, orgKind: "FULL" })).toMatchObject({ side: "team", canManageProjects: false });
    expect(workScope({ userId: "x", role: "CAREGIVER", isAssigned: false, orgKind: "FULL" }).side).toBe("none");
  });
});

describe("projects and tasks", () => {
  let projectId = "";
  let hiddenProjectId = "";
  let shownTaskId = "";
  let hiddenTaskId = "";

  it("only managers create projects; the team adds tasks", async () => {
    await inClient(async () => {
      await expect(createProject(va, { name: "Nope" })).rejects.toThrow(/Only managers/);
      await expect(createProject(owner, { name: "Nope" })).rejects.toThrow(/Only managers/);
      projectId = (await createProject(manager, { name: "Website relaunch", leadId: managerId })).id;
      hiddenProjectId = (await createProject(manager, { name: "Internal ops", clientVisible: false })).id;

      shownTaskId = (await createTask(va, { projectId, title: "Collect logo files", dueDate: "2026-11-20" })).task.id;
      hiddenTaskId = (await createTask(va, { projectId, title: "Price check (internal)", clientVisible: false })).task.id;
      await createTask(va, { projectId: hiddenProjectId, title: "Payroll setup" });
      await expect(createTask(owner, { projectId, title: "Client can't" })).rejects.toThrow(/Only the team/);
    });
  });

  it("the client sees only client-visible projects and tasks", async () => {
    await inClient(async () => {
      const teamProjects = await listProjects(manager.scope);
      expect(teamProjects.map((p) => p.name).sort()).toEqual(["Internal ops", "Website relaunch"]);
      const clientProjects = await listProjects(owner.scope);
      expect(clientProjects.map((p) => p.name)).toEqual(["Website relaunch"]);
      expect(clientProjects[0]).toMatchObject({ total: 1, open: 1 });

      expect((await getProject(owner.scope, projectId))!.tasks.map((t) => t.title)).toEqual(["Collect logo files"]);
      expect(await getProject(owner.scope, hiddenProjectId)).toBeNull();
      expect(await getTaskDetail(owner.scope, hiddenTaskId)).toBeNull();
    });
  });

  it("internal comments and activity never reach the client; the client's own comments are always client-visible", async () => {
    await inClient(async () => {
      await addComment(va, shownTaskId, { body: "They're slow to reply, chase Friday", visibility: "INTERNAL" });
      await addComment(va, shownTaskId, { body: "Could you send the SVG version?", visibility: "CLIENT" });
      const { comment } = await addComment(owner, shownTaskId, { body: "Sent!", visibility: "INTERNAL" });
      expect(comment.visibility).toBe("CLIENT");

      const forClient = await getTaskDetail(owner.scope, shownTaskId);
      expect(forClient!.comments.map((c) => c.body)).toEqual(["Could you send the SVG version?", "Sent!"]);
      expect(forClient!.trackedHours).toBeNull();
      const forTeam = await getTaskDetail(va.scope, shownTaskId);
      expect(forTeam!.comments).toHaveLength(3);

      // The hidden task's "created" entry and the internal comment stay out of the client's activity.
      const clientActivity = await listProjectActivity(owner.scope, projectId);
      expect(clientActivity.some((a) => a.taskId === hiddenTaskId)).toBe(false);
      expect(clientActivity.filter((a) => a.kind === "COMMENTED")).toHaveLength(2);
      expect((await listProjectActivity(manager.scope, projectId)).filter((a) => a.kind === "COMMENTED")).toHaveLength(3);
    });
  });

  it("internal comments notify the team only", async () => {
    await inClient(async () => {
      const req = await requestTask(owner, { projectId, title: "Add a careers page" });
      const internal = await addComment(va, req.task.id, { body: "Needs a quote first", visibility: "INTERNAL" });
      expect(internal.notifications.map((n) => n.userId)).toEqual([managerId]); // the lead, not the client who asked
      const shared = await addComment(va, req.task.id, { body: "On it", visibility: "CLIENT" });
      expect(shared.notifications.map((n) => n.userId).sort()).toEqual([managerId, ownerId].sort());
    });
  });

  it("assigning: only team members, and each new assignee hears about it", async () => {
    await inClient(async () => {
      await expect(setAssignees(manager, shownTaskId, [ownerId])).rejects.toThrow(/from the team/);
      const { notifications } = await setAssignees(manager, shownTaskId, [vaId, managerId]);
      expect(notifications).toEqual([expect.objectContaining({ userId: vaId, type: "WORK_TASK_ASSIGNED" })]);
      expect((await listMyWorkTasks(va.scope, vaId)).map((t) => t.title)).toContain("Collect logo files");
      expect(await listMyWorkTasks(owner.scope, ownerId)).toEqual([]);
    });
  });

  it("finishing records who and when; reopening clears it", async () => {
    await inClient(async () => {
      const done = await updateTask(va, shownTaskId, { status: "DONE" });
      expect(done.completedById).toBe(vaId);
      expect(done.completedAt).toBeInstanceOf(Date);
      const reopened = await updateTask(va, shownTaskId, { status: "IN_PROGRESS" });
      expect(reopened.completedAt).toBeNull();
      const detail = await getTaskDetail(owner.scope, shownTaskId);
      expect(detail!.activities.filter((a) => a.kind === "STATUS_CHANGED").map((a) => a.to)).toEqual(["IN_PROGRESS", "DONE"]);
    });
  });

  it("subtasks stay one level deep in the same project; the board renumbers a column", async () => {
    await inClient(async () => {
      const sub = (await createTask(va, { projectId, parentId: shownTaskId, title: "Ask for brand colors" })).task;
      await expect(createTask(va, { projectId, parentId: sub.id, title: "Too deep" })).rejects.toThrow(/own subtasks/);
      await expect(createTask(va, { projectId: hiddenProjectId, parentId: shownTaskId, title: "Wrong project" })).rejects.toThrow(/same project/);

      const third = (await createTask(va, { projectId, title: "Draft homepage copy" })).task;
      await moveTask(va, third.id, "IN_PROGRESS", [third.id, shownTaskId]);
      const tasks = (await getProject(manager.scope, projectId))!.tasks.filter((t) => t.status === "IN_PROGRESS");
      expect(tasks.map((t) => t.title)).toEqual(["Draft homepage copy", "Collect logo files"]);
    });
  });
});

describe("client requests", () => {
  it("a request lands as a to-do marked as a client request; a manager can decline it with a reason the client sees", async () => {
    await inClient(async () => {
      const projectId = (await listProjects(owner.scope))[0].id;
      await expect(requestTask(va, { projectId, title: "Staff can't request" })).rejects.toThrow(/Only clients/);
      const { task, notifications } = await requestTask(owner, { projectId, title: "Translate the FAQ", details: "Spanish please", dueDate: "2026-12-01" });
      expect(task).toMatchObject({ status: "TODO", isClientRequest: true, clientVisible: true });
      expect(notifications.map((n) => n.userId)).toEqual([managerId]);

      await expect(declineRequest(va, task.id, "No")).rejects.toThrow(/Only managers/);
      await expect(declineRequest(manager, task.id, "  ")).rejects.toThrow(/why/);
      const declined = await declineRequest(manager, task.id, "Out of scope for this project");
      expect(declined.notifications[0]).toMatchObject({ userId: ownerId });
      const seen = await getTaskDetail(owner.scope, task.id);
      expect(seen).toMatchObject({ status: "CANCELLED", declineReason: "Out of scope for this project" });
    });
  });
});

describe("database rules", () => {
  it("a time entry can't point at a licensing task and a project task at once", async () => {
    const c = tenantDb(CLIENT.id);
    const workTask = await c.workTask.findFirstOrThrow({ where: { title: "Collect logo files" } });
    const project = await c.workProject.findFirstOrThrow({ where: { name: "Website relaunch" } });
    const licensingTask = await c.task.create({ data: { label: "x", createdById: vaId } });
    await expect(
      c.taskTimeEntry.create({ data: { userId: vaId, taskId: licensingTask.id, workTaskId: workTask.id, startedAt: new Date() } })
    ).rejects.toThrow(/task_time_entries_one_task/);
    // And no project task can be filed under another workspace's project.
    await expect(
      tenantDb(HOME.id).workTask.create({ data: { projectId: project.id, title: "x", createdById: vaId } })
    ).rejects.toThrow();
  });
});
