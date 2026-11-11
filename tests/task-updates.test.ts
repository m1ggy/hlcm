import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { workScope } from "@/lib/work";
import { createProject, createTask, type WorkActor } from "@/lib/work-service";
import { getReportFor, startDay, submitReport, saveDraft, type EodActor } from "@/lib/eod";
import { postLinkedWorkTaskUpdate, postWorkTaskUpdate, reportLicensingTaskUpdate } from "@/lib/task-updates";
import { toDateInputValue } from "@/lib/time-entries";

// Updates written on a task (docs/task-updates-plan.md): posted on the task,
// and added to the writer's end-of-day report in their home workspace.

const HOME = { id: "org_tu_home", slug: "tu-home", name: "TU Home" };
const CLIENT = { id: "org_tu_client", slug: "tu-client", name: "TU Client" };
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);
const inHome = <T,>(fn: () => Promise<T>) => runAsTenant(HOME, fn);
const today = toDateInputValue(new Date(), "UTC");

let homeVa = "";
let vaHere: WorkActor; // Val at home (FULL workspace)
let vaThere: WorkActor; // Val's linked account in the client's workspace
let owner: WorkActor; // the client's owner
let eodVa: EodActor;
let clientTask = "";
let clientTask2 = "";
let hiddenTask = "";
let homeTask = "";

const report = () => inHome(() => getReportFor(homeVa, today));
const lineFor = async (orgId: string, taskId: string) => (await report())?.items.find((i) => i.workOrgId === orgId && i.workTaskId === taskId);
const reported = (taskId: string) => tenantDb(CLIENT.id).workTaskActivity.findMany({ where: { taskId, kind: "REPORTED" }, orderBy: { occurredAt: "asc" } });

beforeAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id] } } });
  await prisma.organization.create({ data: { ...HOME, timezone: "UTC" } });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  for (const o of [HOME, CLIENT]) forgetOrg(o.slug);
  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@tu-home.test", passwordHash: "x", role: "ADMIN" } });
  const val = await h.user.create({ data: { name: "Val VA", email: "val@tu-home.test", passwordHash: "x", role: "STAFF", timezone: "UTC" } });
  homeVa = val.id;
  eodVa = { userId: val.id, role: "STAFF", timeZone: "UTC" };
  const cat = await tenantDb(CLIENT.id).user.create({ data: { name: "Cat Client", email: "cat@tu-client.test", passwordHash: "x", role: "OWNER" } });
  await assignToWorkspace({ userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" }, { orgId: CLIENT.id, homeUserId: val.id, role: "MANAGER", canAssign: false });
  const linkedId = (await tenantDb(CLIENT.id).user.findFirstOrThrow({ where: { email: "val@tu-home.test" } })).id;
  vaThere = { userId: linkedId, scope: workScope({ userId: linkedId, role: "MANAGER", isAssigned: true, orgKind: "TASKS" }), orgKind: "TASKS" };
  vaHere = { userId: val.id, scope: workScope({ userId: val.id, role: "STAFF", isAssigned: false, orgKind: "FULL" }), orgKind: "FULL" };
  owner = { userId: cat.id, scope: workScope({ userId: cat.id, role: "OWNER", isAssigned: false, orgKind: "TASKS" }), orgKind: "TASKS" };

  await inClient(async () => {
    const projectId = (await createProject(vaThere, { name: "Marketing" })).id;
    clientTask = (await createTask(vaThere, { projectId, title: "Create weekly posts", assigneeIds: [linkedId] })).task.id;
    clientTask2 = (await createTask(vaThere, { projectId, title: "Answer reviews", assigneeIds: [linkedId] })).task.id;
    hiddenTask = (await createTask(vaThere, { projectId, title: "Vendor price check", clientVisible: false })).task.id;
  });
  await inHome(async () => {
    const projectId = (await createProject({ ...vaHere, scope: workScope({ userId: admin.id, role: "ADMIN", isAssigned: false, orgKind: "FULL" }), userId: admin.id }, { name: "Internal" })).id;
    homeTask = (await createTask(vaHere, { projectId, title: "Update the handbook", assigneeIds: [val.id] })).task.id;
  });
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("ticking a task in a client's workspace", () => {
  it("finishes it, posts what was done, and starts today's report with it", async () => {
    await inClient(() => postWorkTaskUpdate(vaThere, CLIENT, clientTask, { text: "Drafted and scheduled 5 posts", minutes: 45, complete: true }));
    const task = await tenantDb(CLIENT.id).workTask.findUniqueOrThrow({ where: { id: clientTask } });
    expect(task.status).toBe("DONE");
    const acts = await reported(clientTask);
    expect(acts.map((a) => [a.to, a.clientVisible])).toEqual([["Drafted and scheduled 5 posts", true]]);
    const line = await lineFor(CLIENT.id, clientTask);
    expect(line).toMatchObject({ workDone: "Drafted and scheduled 5 posts", minutes: 45, fromTaskUpdate: true, addedAfterSubmit: false, clientVisible: true, workStatusAfter: "DONE", workStatusBefore: "DONE", workspaceName: "TU Client" });
  });

  it("a second update on the same task joins its line", async () => {
    await inClient(() => postWorkTaskUpdate(vaThere, CLIENT, clientTask, { text: "Fixed a typo in Friday's post", minutes: 5, shareWithClient: false }));
    const line = await lineFor(CLIENT.id, clientTask);
    expect(line?.workDone).toBe("Drafted and scheduled 5 posts\nFixed a typo in Friday's post");
    expect(line?.minutes).toBe(50);
    expect((await reported(clientTask)).map((a) => a.clientVisible)).toEqual([true, false]);
    expect((await report())?.items.filter((i) => i.workTaskId === clientTask)).toHaveLength(1);
  });

  it("never shares an update on a task the client can't see", async () => {
    await inClient(() => postWorkTaskUpdate(vaThere, CLIENT, hiddenTask, { text: "Got three quotes", shareWithClient: true }));
    expect((await reported(hiddenTask))[0].clientVisible).toBe(false);
    expect((await lineFor(CLIENT.id, hiddenTask))?.clientVisible).toBe(false);
  });

  it("needs something written, and only the team can post", async () => {
    await expect(inClient(() => postWorkTaskUpdate(vaThere, CLIENT, clientTask2, { text: "   ", complete: true }))).rejects.toThrow(/Say what you did/);
    await expect(inClient(() => postWorkTaskUpdate(owner, CLIENT, clientTask2, { text: "Done!", complete: true }))).rejects.toThrow(/team/);
  });
});

describe("from the home workspace", () => {
  it("the Client work page posts in the client's workspace and reports at home", async () => {
    await inHome(() => postLinkedWorkTaskUpdate(homeVa, CLIENT.id, clientTask2, { text: "Replied to 4 reviews", complete: true }));
    expect((await tenantDb(CLIENT.id).workTaskActivity.findFirstOrThrow({ where: { taskId: clientTask2, kind: "REPORTED" } })).actorId).toBe(vaThere.userId);
    expect((await lineFor(CLIENT.id, clientTask2))?.workDone).toBe("Replied to 4 reviews");
  });

  it("the home workspace's own Projects & tasks go on the report too", async () => {
    await inHome(() => postWorkTaskUpdate(vaHere, HOME, homeTask, { text: "Rewrote the onboarding section", status: "IN_REVIEW" }));
    const line = await lineFor(HOME.id, homeTask);
    expect(line).toMatchObject({ workDone: "Rewrote the onboarding section", workStatusAfter: "IN_REVIEW", workspaceName: "TU Home" });
    expect((await tenantDb(HOME.id).workTask.findUniqueOrThrow({ where: { id: homeTask } })).status).toBe("IN_REVIEW");
  });
});

describe("submitting and after", () => {
  it("submitting doesn't post the updates again, and later updates are marked", async () => {
    await inHome(async () => {
      const r = await startDay(eodVa);
      // Start day put Val's other open tasks on the report; drop the untouched ones.
      await saveDraft(eodVa, r.id, { summary: "Client posts and reviews", items: (await getReportFor(homeVa, today))!.items.filter((i) => i.workDone.trim()).map((i) => ({ id: i.id, workDone: i.workDone, minutes: i.minutes, clientVisible: i.clientVisible })) });
      await submitReport(eodVa, r.id);
    });
    expect(await reported(clientTask)).toHaveLength(2);
    expect(await reported(clientTask2)).toHaveLength(1);
    // The task was reopened by someone since: submitting doesn't close it again.
    await inClient(async () => {
      await tenantDb(CLIENT.id).workTask.update({ where: { id: clientTask }, data: { status: "TODO" } });
      await postWorkTaskUpdate(vaThere, CLIENT, clientTask, { text: "One more post for Sunday", complete: true });
    });
    const after = await report();
    expect(after?.status).toBe("SUBMITTED");
    const line = after?.items.find((i) => i.workTaskId === clientTask);
    expect(line?.workDone).toContain("One more post for Sunday");
    expect(line?.addedAfterSubmit).toBe(true);
  });
});

describe("licensing tasks", () => {
  it("ticking one adds what was done to the report, marked as already applied", async () => {
    const { id: taskId } = await tenantDb(HOME.id).task.create({
      data: { label: "File the renewal", status: "COMPLETED", createdById: homeVa, assignees: { create: { userId: homeVa } } },
    });
    const r = await inHome(() => reportLicensingTaskUpdate(homeVa, { id: taskId, status: "COMPLETED", hasClient: false }, { text: "Submitted the renewal online", minutes: 20 }));
    expect(r.addedToReport).toBe(true);
    const line = (await report())?.items.find((i) => i.taskId === taskId);
    expect(line).toMatchObject({ workDone: "Submitted the renewal online", minutes: 20, statusBefore: "COMPLETED", statusAfter: "COMPLETED", fromTaskUpdate: true, clientVisible: false });
  });

  it("someone who may close the task but not report on it still closes it, without a report line", async () => {
    const { id: taskId } = await tenantDb(HOME.id).task.create({ data: { label: "Someone else's task", status: "COMPLETED", createdById: (await tenantDb(HOME.id).user.findFirstOrThrow({ where: { role: "ADMIN" } })).id } });
    const r = await inHome(() => reportLicensingTaskUpdate(homeVa, { id: taskId, status: "COMPLETED", hasClient: false }, { text: "Helped out" }));
    expect(r.addedToReport).toBe(false);
  });
});
