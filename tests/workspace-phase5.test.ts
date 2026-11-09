import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace, endAssignment } from "@/lib/workspace-assignments";
import { nextRepeatDate, workScope } from "@/lib/work";
import {
  approveRequest,
  createFromTemplate,
  createProject,
  createTask,
  declineRequest,
  listPendingRequests,
  requestTask,
  saveTemplate,
  updateTask,
  type WorkActor,
} from "@/lib/work-service";
import { listMyWorkEverywhere, workTaskForLine } from "@/lib/work-everywhere";
import { saveDraft, startDay, submitReport, type EodActor } from "@/lib/eod";
import { getWeekSummary, weekStartOf } from "@/lib/work-summary";

// Workspace tasks, Phase 5 (docs/workspace-tasks-plan.md): recurring tasks,
// templates, the approval queue, "my work everywhere" and EOD lines on
// client-workspace tasks.

const HOME = { id: "org_p5_home", slug: "p5-home", name: "P5 Home" };
const CLIENT = { id: "org_p5_client", slug: "p5-client", name: "P5 Client" };
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);
const inHome = <T,>(fn: () => Promise<T>) => runAsTenant(HOME, fn);

let homeVa = ""; // Val in the home workspace
let assignmentId = "";
let manager: WorkActor; // Mo's linked account (MANAGER)
let va: WorkActor; // Val's linked account (STAFF)
let client: WorkActor; // the client's owner
let projectId = "";

beforeAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id] } } });
  await prisma.organization.create({ data: { ...HOME, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  for (const o of [HOME, CLIENT]) forgetOrg(o.slug);
  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@p5-home.test", passwordHash: "x", role: "ADMIN" } });
  const mo = await h.user.create({ data: { name: "Mo Manager", email: "mo@p5-home.test", passwordHash: "x", role: "STAFF" } });
  const val = await h.user.create({ data: { name: "Val VA", email: "val@p5-home.test", passwordHash: "x", role: "STAFF" } });
  homeVa = val.id;
  const owner = await tenantDb(CLIENT.id).user.create({ data: { name: "Cat Client", email: "cat@p5-client.test", passwordHash: "x", role: "OWNER" } });
  const by = { userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: mo.id, role: "MANAGER", canAssign: true });
  assignmentId = await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: val.id, role: "STAFF", canAssign: false });
  const c = tenantDb(CLIENT.id);
  const linked = async (email: string) => (await c.user.findFirstOrThrow({ where: { email } })).id;
  const mk = (userId: string, role: string, isAssigned: boolean): WorkActor => ({ userId, scope: workScope({ userId, role, isAssigned, orgKind: "TASKS" }), orgKind: "TASKS" });
  manager = mk(await linked("mo@p5-home.test"), "MANAGER", true);
  va = mk(await linked("val@p5-home.test"), "STAFF", true);
  client = mk(owner.id, "OWNER", false);
  projectId = (await inClient(() => createProject(manager, { name: "Bookkeeping" }))).id;
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("recurring tasks", () => {
  it("works out the next date, months included", () => {
    expect(nextRepeatDate("2026-11-04", "DAILY")).toBe("2026-11-05");
    expect(nextRepeatDate("2026-12-29", "WEEKLY")).toBe("2027-01-05");
    expect(nextRepeatDate("2027-01-31", "MONTHLY")).toBe("2027-02-28");
    expect(nextRepeatDate("2028-01-31", "MONTHLY")).toBe("2028-02-29");
  });

  it("finishing one makes the next, once", async () => {
    await inClient(async () => {
      const { task } = await createTask(manager, { projectId, title: "Reconcile bank feed", repeat: "WEEKLY", dueDate: "2026-11-06", assigneeIds: [va.userId] });
      await updateTask(va, task.id, { status: "DONE" });
      const next = await tenantDb(CLIENT.id).workTask.findFirstOrThrow({ where: { repeatedFromId: task.id }, include: { assignees: true } });
      expect(next).toMatchObject({ title: "Reconcile bank feed", status: "TODO", repeat: "WEEKLY" });
      expect(next.dueDate?.toISOString().slice(0, 10)).toBe("2026-11-13");
      expect(next.assignees.map((a) => a.userId)).toEqual([va.userId]);
      // Reopened and finished again: still one next task.
      await updateTask(va, task.id, { status: "IN_PROGRESS" });
      await updateTask(va, task.id, { status: "DONE" });
      expect(await tenantDb(CLIENT.id).workTask.count({ where: { title: "Reconcile bank feed" } })).toBe(2);
    });
  });
});

describe("templates", () => {
  it("saves a task with its subtasks and makes new ones from it", async () => {
    await inClient(async () => {
      const { task } = await createTask(manager, { projectId, title: "Month-end close", priority: "HIGH" });
      await createTask(manager, { projectId, parentId: task.id, title: "Accruals" });
      await createTask(manager, { projectId, parentId: task.id, title: "Payroll journal" });
      const template = await saveTemplate(va, task.id);
      expect(template).toMatchObject({ title: "Month-end close", priority: "HIGH", subtasks: ["Accruals", "Payroll journal"] });
      const { task: made } = await createFromTemplate(va, template.id, { dueDate: "2026-11-30" });
      const subs = await tenantDb(CLIENT.id).workTask.findMany({ where: { parentId: made.id }, orderBy: { sortOrder: "asc" } });
      expect(subs.map((s) => s.title)).toEqual(["Accruals", "Payroll journal"]);
      await expect(saveTemplate(client, task.id)).rejects.toThrow(/team/);
    });
  });
});

describe("the approval queue", () => {
  it("holds client requests until a manager accepts or declines them", async () => {
    await inClient(async () => {
      const { task } = await requestTask(client, { projectId, title: "File the 1099s" });
      expect((await listPendingRequests(manager.scope)).map((t) => t.title)).toContain("File the 1099s");
      expect(await listPendingRequests(va.scope)).toEqual([]); // managers only
      await expect(updateTask(va, task.id, { status: "IN_PROGRESS" })).rejects.toThrow(/Accept or decline/);
      await expect(approveRequest(va, task.id)).rejects.toThrow(/managers/);
      const { notifications } = await approveRequest(manager, task.id, { assigneeIds: [va.userId] });
      expect(notifications.map((n) => n.userId).sort()).toEqual([client.userId, va.userId].sort());
      await updateTask(va, task.id, { status: "IN_PROGRESS" });
      expect((await listPendingRequests(manager.scope)).map((t) => t.title)).not.toContain("File the 1099s");

      const { task: other } = await requestTask(client, { projectId, title: "Redo last year" });
      await declineRequest(manager, other.id, "Out of scope");
      expect((await listPendingRequests(manager.scope)).map((t) => t.title)).not.toContain("Redo last year");
    });
  });
});

describe("work across workspaces", () => {
  let taskId = "";

  it("lists my open tasks in every workspace from home", async () => {
    taskId = (await inClient(() => createTask(manager, { projectId, title: "Chase missing receipts", assigneeIds: [va.userId] }))).task.id;
    const groups = await listMyWorkEverywhere(homeVa);
    expect(groups).toHaveLength(1);
    expect(groups[0].workspace.name).toBe("P5 Client");
    expect(groups[0].tasks.map((t) => t.title)).toContain("Chase missing receipts");
  });

  it("puts them on the EOD and feeds the client's day card on submit", async () => {
    const actor: EodActor = { userId: homeVa, role: "STAFF", timeZone: "UTC" };
    const now = new Date();
    await inHome(async () => {
      const report = await startDay(actor, now);
      const line = report.items.find((i) => i.workTaskId === taskId)!;
      expect(line).toMatchObject({ workOrgId: CLIENT.id, workspaceName: "P5 Client", title: "Chase missing receipts", workStatusBefore: "TODO", clientVisible: true });
      await saveDraft(actor, report.id, {
        items: report.items.map((i) => (i.id === line.id ? { id: i.id, workDone: "Got 12 of the 15 receipts", workStatusAfter: "IN_PROGRESS", clientVisible: true } : { id: i.id })),
      });
      await submitReport(actor, report.id, now);
    });
    const task = await tenantDb(CLIENT.id).workTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe("IN_PROGRESS");
    const today = now.toISOString().slice(0, 10);
    const week = await inClient(() => getWeekSummary({ monday: weekStartOf(today), timeZone: "UTC", orgKind: "TASKS", withHours: false }));
    const day = week.days.find((d) => d.date === today)!;
    expect(day.updates).toEqual([expect.objectContaining({ title: "Chase missing receipts", text: "Got 12 of the 15 receipts", by: "Val VA" })]);
  });

  it("stops once the assignment ends", async () => {
    await expect(workTaskForLine(homeVa, CLIENT.id, taskId)).resolves.toBeTruthy();
    const admin = await tenantDb(HOME.id).user.findFirstOrThrow({ where: { email: "ada@p5-home.test" } });
    await endAssignment({ userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" }, assignmentId);
    await expect(workTaskForLine(homeVa, CLIENT.id, taskId)).rejects.toThrow(/no longer assigned/);
    expect(await listMyWorkEverywhere(homeVa)).toEqual([]);
  });
});
