import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  getEmailBranding: async () => ({ appUrl: "https://urgent-client.example.test", brand: "Client Co" }),
}));

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { workScope } from "@/lib/work";
import { createProject, createTask, type WorkActor } from "@/lib/work-service";
import { urgentTaskAlerts } from "@/lib/work-urgent";

// Urgent task alerts (docs/crm-requests-phase2.md): who hears about it, and
// who also gets a text.

const HOME = { id: "org_urgent_home", slug: "urgent-home", name: "Managing Co" };
const CLIENT = { id: "org_urgent_client", slug: "urgent-client", name: "Client Co" };
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);

const ids: Record<string, string> = {};
let va: WorkActor;
let taskId = "";

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id] } } });
  await prisma.organization.create({ data: HOME });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  for (const o of [HOME, CLIENT]) forgetOrg(o.slug);

  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@urgent-home.test", passwordHash: "x", role: "ADMIN" } });
  // The VA's number lives on their home account.
  const vaHome = await h.user.create({ data: { name: "Val VA", email: "val@urgent-home.test", passwordHash: "x", role: "STAFF", phone: "+15550000001" } });
  const moHome = await h.user.create({ data: { name: "Mo Manager", email: "mo@urgent-home.test", passwordHash: "x", role: "STAFF", phone: "+15550000002", smsUrgentAlerts: false } });
  const by = { userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: vaHome.id, role: "STAFF", canAssign: false });
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: moHome.id, role: "MANAGER", canAssign: true });

  const c = tenantDb(CLIENT.id);
  ids.owner = (await c.user.create({ data: { name: "Olive Owner", email: "olive@urgent-client.test", passwordHash: "x", role: "OWNER", phone: "(555) 000-0003" } })).id;
  ids.staff = (await c.user.create({ data: { name: "Sam Staff", email: "sam@urgent-client.test", passwordHash: "x", role: "STAFF", phone: "+15550000004" } })).id;
  ids.bystander = (await c.user.create({ data: { name: "Bea Bystander", email: "bea@urgent-client.test", passwordHash: "x", role: "STAFF", phone: "+15550000005" } })).id;
  ids.stopped = (await c.user.create({ data: { name: "Stu Stopped", email: "stu@urgent-client.test", passwordHash: "x", role: "ADMIN", phone: "+15550000006", smsOptedOutAt: new Date() } })).id;
  ids.caregiver = (await c.user.create({ data: { name: "Cara Giver", passwordHash: "x", role: "CAREGIVER", phone: "+15550000007" } })).id;
  ids.va = (await c.user.findFirstOrThrow({ where: { email: "val@urgent-home.test" } })).id;
  ids.mo = (await c.user.findFirstOrThrow({ where: { email: "mo@urgent-home.test" } })).id;

  va = { userId: ids.va, scope: workScope({ userId: ids.va, role: "STAFF", isAssigned: true, orgKind: "TASKS" }), orgKind: "TASKS" };
  const mo: WorkActor = { userId: ids.mo, scope: workScope({ userId: ids.mo, role: "MANAGER", isAssigned: true, orgKind: "TASKS" }), orgKind: "TASKS" };
  await inClient(async () => {
    const projectId = (await createProject(mo, { name: "Licensing renewal" })).id;
    taskId = (await createTask(mo, { projectId, title: "Renew state license", assigneeIds: [ids.va] })).task.id;
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("urgent task alerts", () => {
  it("tells the task's people and the workspace's managers, never the one who marked it", async () => {
    const { notifications } = await inClient(() => urgentTaskAlerts(ids.owner, taskId));
    const told = new Set(notifications.map((n) => n.userId));
    // The assignee (Val), plus managers (Mo, Stu) — not plain staff or the caregiver; Olive marked it.
    expect(told).toEqual(new Set([ids.va, ids.mo, ids.stopped]));
    expect(notifications[0]).toMatchObject({ type: "WORK_TASK_URGENT", entityId: taskId, message: 'Olive Owner marked "Renew state license" (Licensing renewal) urgent' });
  });

  it("texts those with a number who haven't turned it off or replied STOP", async () => {
    const { texts } = await inClient(() => urgentTaskAlerts(va.userId, taskId));
    const byUser = new Map(texts.map((t) => [t.user.id, t]));
    // Just Olive (owner). Mo turned urgent texts off at home; Stu replied
    // STOP; Val marked it.
    expect(new Set(byUser.keys())).toEqual(new Set([ids.owner]));
    expect(byUser.get(ids.owner)?.user.phone).toBe("+15550000003");
    expect(byUser.get(ids.owner)?.body).toBe(
      `URGENT in Client Co: Val VA marked "Renew state license" urgent. https://urgent-client.example.test/work/tasks/${taskId} Reply STOP to opt out.`
    );
  });

  it("uses the home account's number for the managing company's staff", async () => {
    const { texts } = await inClient(() => urgentTaskAlerts(ids.owner, taskId));
    const vaText = texts.find((t) => t.user.id === ids.va);
    expect(vaText?.user.phone).toBe("+15550000001");
    expect(texts.some((t) => t.user.id === ids.mo)).toBe(false);
  });
});
