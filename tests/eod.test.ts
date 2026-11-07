import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: mail.send,
  getEmailBranding: async () => ({ appUrl: "https://eod.example.test", brand: "Eod Co" }),
  renderEmailLayout: (o: { bodyHtml: string }) => o.bodyHtml,
}));

import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { addReportComment, eodRequiredFor, reopenReport, saveDraft, startDay, submitReport, teamDay, type EodActor } from "@/lib/eod";
import { runEodReminders } from "@/lib/eod-reminders";

// End-of-day reports (docs/client-portal-eod-plan.md, Phase C).

const ORG = { id: "org_eod", slug: "eod-co", name: "Eod Co" };
const inOrg = <T,>(fn: () => Promise<T>) => runAsTenant(ORG, fn);
const TZ = "UTC";
// A fixed working day: 10am UTC on a Wednesday.
const MORNING = new Date("2026-11-04T10:00:00Z");
const EVENING = new Date("2026-11-04T19:00:00Z");
const DAY = "2026-11-04";

let va: EodActor;
let manager: EodActor;
let other: EodActor;
const tasks: Record<string, string> = {};

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: { ...ORG, timezone: TZ } });
  forgetOrg(ORG.slug);
  const t = tenantDb(ORG.id);
  const mk = (name: string, role: "STAFF" | "MANAGER") =>
    t.user.create({ data: { name, email: `${name.toLowerCase().replace(" ", ".")}@eod.test`, passwordHash: "x", role } });
  const [v, m, o] = await Promise.all([mk("Val VA", "STAFF"), mk("Mo Manager", "MANAGER"), mk("Oz Other", "STAFF")]);
  va = { userId: v.id, role: "STAFF", timeZone: TZ };
  manager = { userId: m.id, role: "MANAGER", timeZone: TZ };
  other = { userId: o.id, role: "STAFF", timeZone: TZ };
  const task = (label: string, extra: object = {}) =>
    t.task.create({ data: { label, createdById: m.id, assignees: { create: [{ userId: v.id }] }, ...extra } });
  tasks.due = (await task("File the renewal", { dueDate: new Date("2026-11-05T00:00:00Z") })).id;
  tasks.open = (await task("Call the agency")).id;
  tasks.done = (await task("Old finished task", { status: "COMPLETED" })).id;
  // Not assigned to Val, but Val timed it this morning.
  tasks.timed = (await t.task.create({ data: { label: "Help Oz with intake", createdById: o.id } })).id;
  await t.taskTimeEntry.create({
    data: { userId: v.id, taskId: tasks.timed, startedAt: new Date("2026-11-04T08:00:00Z"), endedAt: new Date("2026-11-04T08:45:00Z"), source: "TIMER" },
  });
  await t.taskReviewer.create({ data: { taskId: tasks.due, userId: m.id } }).catch(() => undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("starting the day", () => {
  it("pre-fills timed tasks first, then open assigned tasks by due date", async () => {
    const report = await inOrg(() => startDay(va, MORNING));
    expect(report.reportDate.toISOString().slice(0, 10)).toBe(DAY);
    expect(report.items.map((i) => i.title)).toEqual(["Help Oz with intake", "File the renewal", "Call the agency"]);
    expect(report.items[0].minutes).toBe(45);
    expect(report.items.every((i) => i.statusBefore === "NOT_STARTED" && i.clientVisible === false)).toBe(true);
    // Starting again returns the same report.
    expect((await inOrg(() => startDay(va, MORNING))).id).toBe(report.id);
  });

  it("is only for roles that write them", async () => {
    await expect(inOrg(() => startDay({ ...va, role: "CAREGIVER" }, MORNING))).rejects.toThrow(/aren't used/);
    expect(eodRequiredFor({ role: "STAFF", eodRequired: null })).toBe(true);
    expect(eodRequiredFor({ role: "MANAGER", eodRequired: null })).toBe(false);
    expect(eodRequiredFor({ role: "STAFF", eodRequired: false })).toBe(false);
    expect(eodRequiredFor({ role: "CAREGIVER", eodRequired: true })).toBe(false);
  });
});

describe("writing and submitting", () => {
  it("saves lines, applies status changes on submit and drops untouched lines", async () => {
    await inOrg(async () => {
      const report = await startDay(va, MORNING);
      const [timed, due, open] = report.items;
      await expect(saveDraft(other, report.id, { items: [] })).rejects.toThrow(/not found/);
      await expect(saveDraft(va, report.id, { items: [{ taskId: tasks.done }, ...report.items] })).resolves.toBeTruthy(); // own (assigned) task: fine
      const saved = await saveDraft(va, report.id, {
        summary: "Good day",
        blockers: "  ",
        items: [
          { id: due.id, workDone: "Sent the renewal packet", statusAfter: "COMPLETED", minutes: 30 },
          { id: timed.id, workDone: "Walked Oz through intake" },
          { id: open.id, workDone: "" },
          { title: "Team meeting", workDone: "Weekly sync", minutes: 60 },
        ],
      });
      expect(saved.items.map((i) => i.title)).toEqual(["File the renewal", "Help Oz with intake", "Call the agency", "Team meeting"]);
      expect(saved.blockers).toBeNull();

      await submitReport(va, report.id, EVENING).then(({ notifications }) => {
        expect(notifications.map((n) => n.type)).toEqual(["TASK_STATUS_CHANGED"]);
      });
      const after = await tenantDb(ORG.id).eodReport.findUniqueOrThrow({ where: { id: report.id }, include: { items: true } });
      expect(after.status).toBe("SUBMITTED");
      expect(after.items.map((i) => i.title).sort()).toEqual(["File the renewal", "Help Oz with intake", "Team meeting"]); // "Call the agency" was untouched
      expect((await tenantDb(ORG.id).task.findUniqueOrThrow({ where: { id: tasks.due } })).status).toBe("COMPLETED");
      const audit = await tenantDb(ORG.id).auditLog.findFirst({ where: { entityType: "Task", entityId: tasks.due, field: "status" } });
      expect(audit).toMatchObject({ actorId: va.userId, oldValue: "NOT_STARTED", newValue: "COMPLETED" });
      await expect(saveDraft(va, report.id, { items: [] })).rejects.toThrow(/submitted/);
    });
  });

  it("asks for what was done on a line whose status changed", async () => {
    await inOrg(async () => {
      const report = await startDay(other, MORNING);
      await saveDraft(other, report.id, { items: [{ taskId: tasks.timed, statusAfter: "IN_PROGRESS", workDone: "" }] });
      await expect(submitReport(other, report.id, EVENING)).rejects.toThrow(/Say what you did on "Help Oz with intake"/);
    });
  });

  it("someone else's task can't go on your report", async () => {
    await inOrg(async () => {
      const report = await startDay(other, MORNING);
      await expect(saveDraft(other, report.id, { items: [{ taskId: tasks.open, workDone: "x" }] })).rejects.toThrow(/your own tasks/);
    });
  });
});

describe("after submitting", () => {
  it("the author reopens the same day only; managers any time", async () => {
    await inOrg(async () => {
      const report = (await startDay(va, MORNING))!;
      await expect(reopenReport(va, report.id, new Date("2026-11-05T09:00:00Z"))).rejects.toThrow(/until the end of its day/);
      await expect(reopenReport(other, report.id, EVENING)).rejects.toThrow(/not found/);
      expect((await reopenReport(manager, report.id, new Date("2026-11-06T09:00:00Z"))).status).toBe("DRAFT");
      await submitReport(va, report.id, EVENING);
      expect((await reopenReport(va, report.id, EVENING)).status).toBe("DRAFT");
      await submitReport(va, report.id, EVENING);
    });
  });

  it("comments notify the other side", async () => {
    await inOrg(async () => {
      const report = await startDay(va, MORNING);
      expect((await addReportComment(manager, report.id, "Nice work on the renewal")).map((n) => n.userId)).toEqual([va.userId]);
      expect((await addReportComment(va, report.id, "Thanks!")).map((n) => n.userId)).toEqual([manager.userId]);
      await expect(addReportComment(other, report.id, "hi")).rejects.toThrow(/not found/);
    });
  });
});

describe("the team page and reminders", () => {
  it("shows who submitted, who's drafting and who's missing", async () => {
    const rows = await inOrg(() => teamDay(DAY));
    const state = Object.fromEntries(rows.map((r) => [r.name, r.state]));
    expect(state).toEqual({ "Mo Manager": "NOT_EXPECTED", "Oz Other": "DRAFT", "Val VA": "SUBMITTED" });
  });

  it("reminds people who worked and haven't submitted, at 6 pm, once; managers get the list", async () => {
    await inOrg(async () => {
      expect(await runEodReminders(ORG.slug, new Date("2026-11-04T17:00:00Z"))).toEqual({ reminded: 0, managers: 0 });
      expect(await runEodReminders(ORG.slug, new Date("2026-11-04T18:30:00Z"))).toEqual({ reminded: 1, managers: 1 });
      expect(await runEodReminders(ORG.slug, new Date("2026-11-04T19:30:00Z"))).toEqual({ reminded: 0, managers: 0 });
      const notes = await tenantDb(ORG.id).notification.findMany({ where: { type: "EOD_REMINDER" }, include: { user: { select: { name: true } } } });
      expect(notes.map((n) => [n.user.name, n.message]).sort()).toEqual([
        ["Mo Manager", "1 person hasn't submitted today's end-of-day report: Oz Other"],
        ["Oz Other", "Your end-of-day report is still a draft — finish and submit it"],
      ]);
    });
  });
});
