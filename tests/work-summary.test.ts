import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Claude and email are faked: these tests check what gets summarized and sent, not the services.
const ai = vi.hoisted(() => ({ day: vi.fn(), week: vi.fn() }));
vi.mock("@/lib/work-ai", () => ({
  aiSummariesConfigured: () => true,
  writeDayNote: ai.day,
  writeWeekNote: ai.week,
}));
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: mail.send,
  getEmailBranding: async () => ({ appUrl: "https://client.example.test", brand: "Client Co" }),
  renderEmailLayout: (o: { bodyHtml: string }) => o.bodyHtml,
}));

const sms = vi.hoisted(() => ({ text: vi.fn() }));
vi.mock("@/lib/sms", async (orig) => ({
  ...(await orig<typeof import("@/lib/sms")>()),
  isPlatformSmsConfigured: () => true,
  textUser: sms.text,
}));

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { workScope } from "@/lib/work";
import { addComment, createProject, createTask, updateTask, type WorkActor } from "@/lib/work-service";
import { addDays, getWeekSummary, weekStartOf } from "@/lib/work-summary";
import { runSummaryJob, saveSummaryNote, setDayTextSkip } from "@/lib/work-summary-notes";
import { toDateInputValue } from "@/lib/time-entries";

// The client's weekly summary (docs/workspace-tasks-plan.md, Phase 3).

const HOME = { id: "org_ws_home", slug: "ws-home", name: "Managing Co" };
const CLIENT = { id: "org_ws_client", slug: "ws-client", name: "Client Co" };
const inClient = <T,>(fn: () => Promise<T>) => runAsTenant(CLIENT, fn);

let manager: WorkActor;
let va: WorkActor;
let vaId = "";
let projectId = "";
const today = toDateInputValue(new Date(), "UTC");
const monday = weekStartOf(today);
// Notes Claude was asked to write for today. The job also backfills the
// past week, which on a Monday includes the "last week" fixture below.
const todayNoteCalls = () => ai.day.mock.calls.filter(([d]) => (d as { date: string }).date === today).length;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id] } } });
  await prisma.organization.create({ data: HOME });
  await prisma.organization.create({ data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, timezone: "UTC" } });
  for (const o of [HOME, CLIENT]) forgetOrg(o.slug);
  const h = tenantDb(HOME.id);
  const admin = await h.user.create({ data: { name: "Ada Admin", email: "ada@ws-home.test", passwordHash: "x", role: "ADMIN" } });
  const m = await h.user.create({ data: { name: "Mo Manager", email: "mo@ws-home.test", passwordHash: "x", role: "STAFF" } });
  const v = await h.user.create({ data: { name: "Val VA", email: "val@ws-home.test", passwordHash: "x", role: "STAFF" } });
  await tenantDb(CLIENT.id).user.create({ data: { name: "Cat Client", email: "cat@ws-client.test", passwordHash: "x", role: "OWNER" } });
  const by = { userId: admin.id, orgId: HOME.id, role: "ADMIN", name: "Ada Admin" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: m.id, role: "MANAGER", canAssign: true });
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: v.id, role: "STAFF", canAssign: false });
  const c = tenantDb(CLIENT.id);
  const managerId = (await c.user.findFirstOrThrow({ where: { email: "mo@ws-home.test" } })).id;
  vaId = (await c.user.findFirstOrThrow({ where: { email: "val@ws-home.test" } })).id;
  const mk = (userId: string, role: string) => ({ userId, scope: workScope({ userId, role, isAssigned: true, orgKind: "TASKS" }), orgKind: "TASKS" as const });
  manager = mk(managerId, "MANAGER");
  va = mk(vaId, "STAFF");

  await inClient(async () => {
    projectId = (await createProject(manager, { name: "Website relaunch" })).id;
    const logo = (await createTask(va, { projectId, title: "Collect logo files" })).task;
    const copy = (await createTask(va, { projectId, title: "Draft homepage copy" })).task;
    const secret = (await createTask(va, { projectId, title: "Vendor price check", clientVisible: false })).task;
    await updateTask(va, logo.id, { status: "IN_PROGRESS" });
    await updateTask(va, logo.id, { status: "DONE" });
    await updateTask(va, copy.id, { status: "IN_REVIEW" });
    await updateTask(va, secret.id, { status: "DONE" });
    await addComment(va, logo.id, { body: "Got the SVGs, thanks!", visibility: "CLIENT" });
    await addComment(va, logo.id, { body: "Took three reminders", visibility: "INTERNAL" });
    // Something finished last week, for the Monday email.
    await tenantDb(CLIENT.id).workTaskActivity.create({
      data: { taskId: logo.id, projectId, actorId: vaId, kind: "STATUS_CHANGED", from: "TODO", to: "DONE", occurredAt: new Date(`${addDays(monday, -6)}T12:00:00Z`) },
    });
    const start = new Date(Date.now() - 2 * 3_600_000);
    await tenantDb(CLIENT.id).taskTimeEntry.create({ data: { userId: vaId, workTaskId: logo.id, startedAt: start, endedAt: new Date(start.getTime() + 90 * 60_000) } });
  });
});

// Like the real thing: nothing to say about a quiet day or week.
const busy = (d: { completed: unknown[]; progressed: unknown[]; added: unknown[]; comments: unknown[]; files: unknown[] }) =>
  d.completed.length + d.progressed.length + d.added.length + d.comments.length + d.files.length > 0;
beforeEach(() => {
  ai.day.mockReset().mockImplementation(async (d) => (busy(d) ? "We finished collecting the logo files." : null));
  ai.week.mockReset().mockImplementation(async (days: Parameters<typeof busy>[0][]) => (days.some(busy) ? "A good week on the website relaunch." : null));
  mail.send.mockReset().mockResolvedValue(undefined);
  sms.text.mockReset().mockImplementation(async (u: { id: string }) => ({ userId: u.id, ok: true }));
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("the week summary", () => {
  it("shows only what the client can see, bucketed by day", async () => {
    const week = await inClient(() => getWeekSummary({ monday, timeZone: "UTC", orgKind: "TASKS", withHours: false }));
    const day = week.days.find((d) => d.date === today)!;
    expect(day.completed.map((c) => c.title)).toEqual(["Collect logo files"]); // not the hidden price check
    // The logo task moved forward and finished the same day: it reads as finished only.
    expect(day.progressed.map((p) => [p.title, p.to])).toEqual([["Draft homepage copy", "IN_REVIEW"]]);
    expect(day.added.map((a) => a.title).sort()).toEqual(["Collect logo files", "Draft homepage copy"]);
    expect(day.comments.map((c) => c.body)).toEqual(["Got the SVGs, thanks!"]);
    expect(day.hours).toBeNull();
    expect(week.totals).toMatchObject({ completed: 1, progressed: 1, comments: 1, hours: null });
    expect(week.days.filter((d) => d.date !== today).every((d) => d.completed.length === 0)).toBe(true);
  });

  it("adds hours only when asked for", async () => {
    const week = await inClient(() => getWeekSummary({ monday, timeZone: "UTC", orgKind: "TASKS", withHours: true }));
    expect(week.totals.hours).toBe(1.5);
  });
});

describe("notes", () => {
  it("only the team's managers write them; editing Claude's note marks it edited", async () => {
    await inClient(async () => {
      await expect(saveSummaryNote(va, "DAY", today, "Hi")).rejects.toThrow(/managers/);
      await runSummaryJob(CLIENT.slug, new Date(`${today}T20:00:00Z`));
      let note = await tenantDb(CLIENT.id).workSummaryNote.findFirstOrThrow({ where: { period: "DAY", date: new Date(`${today}T00:00:00Z`) } });
      expect(note).toMatchObject({ source: "AI", body: "We finished collecting the logo files." });
      expect(todayNoteCalls()).toBe(1);

      await saveSummaryNote(manager, "DAY", today, "We finished the logo files and started the homepage copy.");
      note = await tenantDb(CLIENT.id).workSummaryNote.findUniqueOrThrow({ where: { id: note.id } });
      expect(note.source).toBe("EDITED");

      // The next run leaves an existing note alone.
      ai.day.mockClear();
      await runSummaryJob(CLIENT.slug, new Date(`${today}T21:00:00Z`));
      expect(ai.day).not.toHaveBeenCalled();
      const week = await getWeekSummary({ monday, timeZone: "UTC", orgKind: "TASKS", withHours: false });
      expect(week.days.find((d) => d.date === today)!.note).toMatchObject({ source: "EDITED", authorName: "Mo Manager" });
    });
  });

  it("today's note waits until the evening", async () => {
    await inClient(async () => {
      await tenantDb(CLIENT.id).workSummaryNote.deleteMany({ where: { period: "DAY" } });
      await runSummaryJob(CLIENT.slug, new Date(`${today}T10:00:00Z`));
      expect(todayNoteCalls()).toBe(0);
    });
  });

  it("does nothing when the workspace turns AI notes off", async () => {
    await prisma.organization.update({ where: { id: CLIENT.id }, data: { workAiSummaries: false } });
    forgetOrg(CLIENT.slug);
    await inClient(() => runSummaryJob(CLIENT.slug, new Date(`${today}T20:00:00Z`)));
    expect(ai.day).not.toHaveBeenCalled();
    await prisma.organization.update({ where: { id: CLIENT.id }, data: { workAiSummaries: true } });
    forgetOrg(CLIENT.slug);
  });
});

describe("the Monday email", () => {
  it("goes to the client's own people once, with last week's paragraph", async () => {
    await inClient(async () => {
      // Earlier runs this session already sent it (they ran after 8am); start over.
      await tenantDb(CLIENT.id).workSummaryNote.deleteMany({ where: { period: "WEEK" } });
      await runSummaryJob(CLIENT.slug, new Date(`${today}T09:00:00Z`));
      expect(ai.week).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
      const sent = mail.send.mock.calls[0][0];
      expect(sent.to).toEqual(["cat@ws-client.test"]); // not the managing company's linked accounts
      expect(sent.subject).toContain("1 finished");
      expect(sent.html).toContain("A good week on the website relaunch.");

      await runSummaryJob(CLIENT.slug, new Date(`${today}T10:00:00Z`));
      expect(mail.send).toHaveBeenCalledTimes(1);
    });
  });
});

describe("the evening text", () => {
  const at = (hour: number) => new Date(`${today}T${String(hour).padStart(2, "0")}:00:00Z`);
  const setText = async (on: boolean) => {
    await prisma.organization.update({ where: { id: CLIENT.id }, data: { workDailyText: on } });
    forgetOrg(CLIENT.slug);
  };
  const resetDay = () =>
    tenantDb(CLIENT.id).workSummaryNote.updateMany({ where: { period: "DAY", date: new Date(`${today}T00:00:00Z`) }, data: { textedAt: null, textedCount: null, textSkip: false } });

  beforeAll(async () => {
    const c = tenantDb(CLIENT.id);
    await c.user.updateMany({ where: { email: "cat@ws-client.test" }, data: { phone: "+15555550100", smsDailyUpdates: true } });
    // A linked account (the managing company's VA) who ticked it anyway: never texted the client's update.
    await c.user.update({ where: { id: vaId }, data: { phone: "+15555550101", smsDailyUpdates: true } });
    await c.user.create({ data: { name: "Olly Optout", email: "olly@ws-client.test", passwordHash: "x", role: "STAFF", phone: "+15555550102", smsDailyUpdates: true, smsOptedOutAt: new Date() } });
    await c.user.create({ data: { name: "Nina Nope", email: "nina@ws-client.test", passwordHash: "x", role: "STAFF", phone: "+15555550103" } });
  });
  beforeEach(resetDay);
  afterAll(() => setText(false));

  it("is off until the team turns it on", async () => {
    await inClient(() => runSummaryJob(CLIENT.slug, at(20)));
    expect(sms.text).not.toHaveBeenCalled();
  });

  it("goes once, after 8 pm, only to the client's people who signed up", async () => {
    await setText(true);
    await inClient(async () => {
      await runSummaryJob(CLIENT.slug, at(19));
      expect(sms.text).not.toHaveBeenCalled();

      await runSummaryJob(CLIENT.slug, at(20));
      expect(sms.text).toHaveBeenCalledTimes(1);
      const [to, body, meta] = sms.text.mock.calls[0];
      expect(to.phone).toBe("+15555550100");
      expect(body).toMatch(/^Managing Co update, /); // signed by the company that runs the workspace
      expect(body).toContain(`https://client.example.test/work/summary?day=${today}`);
      expect(body).toMatch(/Reply STOP to opt out\.$/);
      expect(body.length).toBeLessThanOrEqual(459);
      expect(meta.purpose).toBe("WORK_DAY_TEXT");
      const note = await tenantDb(CLIENT.id).workSummaryNote.findFirstOrThrow({ where: { period: "DAY", date: new Date(`${today}T00:00:00Z`) } });
      expect(note.textedCount).toBe(1);
      expect(body).toContain(note.body.slice(0, 30));

      await runSummaryJob(CLIENT.slug, at(21));
      expect(sms.text).toHaveBeenCalledTimes(1);
    });
  });

  it("isn't sent late at night", async () => {
    await setText(true);
    await inClient(() => runSummaryJob(CLIENT.slug, at(23)));
    expect(sms.text).not.toHaveBeenCalled();
  });

  it("can be skipped for a day by the team's managers, and not after it's gone", async () => {
    await setText(true);
    await inClient(async () => {
      await expect(setDayTextSkip(va, today, true)).rejects.toThrow(/managers/);
      await setDayTextSkip(manager, today, true);
      await runSummaryJob(CLIENT.slug, at(20));
      expect(sms.text).not.toHaveBeenCalled();

      await setDayTextSkip(manager, today, false);
      await runSummaryJob(CLIENT.slug, at(20));
      expect(sms.text).toHaveBeenCalledTimes(1);
      await expect(setDayTextSkip(manager, today, true)).rejects.toThrow(/already gone out/);
    });
  });

  it("a skip flag on a day with no note yet doesn't stop the note, or mark a person's note as AI", async () => {
    const yesterday = addDays(today, -1);
    await inClient(async () => {
      await tenantDb(CLIENT.id).workSummaryNote.deleteMany({ where: { period: "DAY", date: new Date(`${yesterday}T00:00:00Z`) } });
      await setDayTextSkip(manager, yesterday, true);
      await saveSummaryNote(manager, "DAY", yesterday, "Quiet day of planning.");
      const note = await tenantDb(CLIENT.id).workSummaryNote.findFirstOrThrow({ where: { period: "DAY", date: new Date(`${yesterday}T00:00:00Z`) } });
      expect(note.source).toBe("HUMAN");
      expect(note.textSkip).toBe(true);
    });
  });
});
