import { createHash, randomBytes } from "crypto";
import { currentOrgId, db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";
import { dayRangeToInstants, toDateInputValue } from "@/lib/time-entries";
import { addDays, weekStartOf } from "@/lib/work-summary";
import { TASK_CLOSED_STATUSES, type TaskStatusValue } from "@/lib/task-status";

// Share links (docs/client-portal-eod-plan.md, Phase D, decided D8–D10): a
// read-only progress page for one application that anyone with the link
// can open — no account. Replaces the client portal.
//
// The token is 32 random bytes; only its SHA-256 is stored, so the link
// can be shown when it's made and never again (make a new one to share it
// again). Lookups are scoped to the host's workspace by the tenant db, so a
// token can never open another workspace's application.
//
// What the page shows is built here from scratch (sharePageData), field by
// field — never a staff query passed through — so internal notes, hours,
// files, assignees and credentials can't leak by accident.

export type ShareActor = { userId: string; role: string };

const MANAGEMENT = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER"];
/** Views closer together than this count, but aren't each audited. */
const VIEW_AUDIT_GAP_MS = 60 * 60 * 1000;

export const hashShareToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/** Management, or the application's owner (assigned VA) or manager. */
async function shareableApplication(actor: ShareActor, applicationId: string) {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, name: true, assignedUserId: true, assignedManagerId: true, clientId: true },
  });
  if (!app) throw new UserFacingError("Application not found");
  const allowed = MANAGEMENT.includes(actor.role) || app.assignedUserId === actor.userId || app.assignedManagerId === actor.userId;
  if (!allowed || actor.role === "CLIENT" || actor.role === "CAREGIVER") throw new UserFacingError("Only managers or whoever runs this application can share it");
  return app;
}

export async function canShareApplication(actor: ShareActor, applicationId: string) {
  return shareableApplication(actor, applicationId).then(
    () => true,
    () => false
  );
}

const LINK_SELECT = {
  id: true,
  createdAt: true,
  expiresAt: true,
  lastViewedAt: true,
  viewCount: true,
  createdBy: { select: { name: true } },
} as const;

/** The application's active link (not revoked; may have expired), for the Share dialog. */
export async function getActiveShareLink(actor: ShareActor, applicationId: string) {
  await shareableApplication(actor, applicationId);
  return db.applicationShareLink.findFirst({ where: { applicationId, revokedAt: null }, select: LINK_SELECT });
}

/**
 * Makes a new link, revoking the current one. Returns the raw token — the
 * only time it exists outside the URL.
 */
export async function createShareLink(actor: ShareActor, applicationId: string, opts: { expiresAt?: Date | null } = {}, now = new Date()) {
  await shareableApplication(actor, applicationId);
  if (opts.expiresAt && (Number.isNaN(opts.expiresAt.getTime()) || opts.expiresAt <= now)) throw new UserFacingError("Pick an expiry date in the future");
  const token = newToken();
  const link = await db.$transaction(async (tx) => {
    const replaced = await tx.applicationShareLink.updateMany({
      where: { applicationId, revokedAt: null },
      data: { revokedAt: now, revokedById: actor.userId },
    });
    const created = await tx.applicationShareLink.create({
      data: { applicationId, tokenHash: hashShareToken(token), createdById: actor.userId, expiresAt: opts.expiresAt ?? null },
      select: LINK_SELECT,
    });
    return { ...created, replaced: replaced.count > 0 };
  });
  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: link.replaced ? "regenerate_share_link" : "create_share_link",
    actorId: actor.userId,
    field: "share_link",
    newValue: opts.expiresAt ? `expires ${opts.expiresAt.toISOString().slice(0, 10)}` : "no expiry",
  });
  return { token, link };
}

export async function setShareLinkExpiry(actor: ShareActor, applicationId: string, expiresAt: Date | null, now = new Date()) {
  await shareableApplication(actor, applicationId);
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= now)) throw new UserFacingError("Pick an expiry date in the future");
  const link = await db.applicationShareLink.findFirst({ where: { applicationId, revokedAt: null } });
  if (!link) throw new UserFacingError("There's no active link");
  await db.applicationShareLink.update({ where: { id: link.id }, data: { expiresAt } });
  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "share_link_expiry",
    actorId: actor.userId,
    field: "share_link",
    oldValue: link.expiresAt?.toISOString().slice(0, 10) ?? "no expiry",
    newValue: expiresAt?.toISOString().slice(0, 10) ?? "no expiry",
  });
}

export async function revokeShareLink(actor: ShareActor, applicationId: string, now = new Date()) {
  await shareableApplication(actor, applicationId);
  const { count } = await db.applicationShareLink.updateMany({
    where: { applicationId, revokedAt: null },
    data: { revokedAt: now, revokedById: actor.userId },
  });
  if (count === 0) throw new UserFacingError("There's no active link");
  await recordAudit({ entityType: "Application", entityId: applicationId, action: "revoke_share_link", actorId: actor.userId, field: "share_link" });
}

/**
 * The link a visitor's token opens, or null for anything unknown, revoked or
 * expired — the page says the same thing for all three. Counts the view.
 */
export async function openShareLink(token: string, ip: string | null, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const link = await db.applicationShareLink.findUnique({
    where: { organizationId_tokenHash: { organizationId: await currentOrgId(), tokenHash: hashShareToken(token) } },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= now)) return null;
  await db.applicationShareLink.update({ where: { id: link.id }, data: { lastViewedAt: now, viewCount: { increment: 1 } } });
  if (!link.lastViewedAt || now.getTime() - link.lastViewedAt.getTime() > VIEW_AUDIT_GAP_MS) {
    // Nobody's signed in: the entry is filed under whoever made the link.
    await recordAudit({
      entityType: "Application",
      entityId: link.applicationId,
      action: "share_link_viewed",
      actorId: link.createdById,
      field: "share_link",
      ipAddress: ip,
    });
  }
  return link;
}

// ---------------------------------------------------------------------------
// What the page shows.

export type SharedStage = { id: string; name: string; hex: string; state: "done" | "current" | "upcoming" };
export type SharedDayEntry =
  | { type: "work"; title: string; text: string; status: TaskStatusValue | null }
  | { type: "correspondence"; kind: string; direction: string; subject: string; at: Date };
export type SharedTask = { title: string; status: TaskStatusValue; dueDate: Date | null; subtasks: { title: string; status: TaskStatusValue }[] };

export type SharePageData = {
  clientName: string;
  applicationName: string;
  licenseType: string | null;
  stage: { name: string; hex: string; exit: boolean } | null;
  waitingOnClient: boolean;
  updatedAt: Date;
  stages: SharedStage[];
  history: { stage: string; hex: string; at: Date }[];
  week: { monday: string; days: { date: string; entries: SharedDayEntry[] }[] };
  phases: { name: string; tasks: SharedTask[] }[];
  progress: { done: number; total: number };
};

const isClosed = (s: string) => (TASK_CLOSED_STATUSES as readonly string[]).includes(s);

export async function sharePageData(applicationId: string, opts: { day: string; timeZone: string }): Promise<SharePageData> {
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      name: true,
      pipeline: true,
      updatedAt: true,
      client: { select: { name: true } },
      licenseTypeTemplate: { select: { name: true } },
      stage: { select: { id: true, name: true, hex: true, sortOrder: true, isExitStatus: true, role: true } },
    },
  });

  const forward = app.pipeline
    ? await db.pipelineStage.findMany({
        where: { pipeline: app.pipeline, active: true, isExitStatus: false },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, hex: true, sortOrder: true },
      })
    : [];
  const current = app.stage;
  const stages: SharedStage[] = forward.map((s) => ({
    id: s.id,
    name: s.name,
    hex: s.hex,
    state: !current ? "upcoming" : current.isExitStatus || s.sortOrder < current.sortOrder ? "done" : s.id === current.id ? "current" : "upcoming",
  }));

  const history = await db.stageHistory.findMany({
    where: { applicationId },
    orderBy: { enteredAt: "asc" },
    select: { enteredAt: true, stage: { select: { name: true, hex: true } } },
  });

  // The week holding `day`, in the workspace's timezone.
  const monday = weekStartOf(opts.day);
  const sunday = addDays(monday, 6);
  const range = dayRangeToInstants(monday, sunday, opts.timeZone);
  const [lines, mail] = await Promise.all([
    db.eodReportItem.findMany({
      where: {
        applicationId,
        clientVisible: true,
        workDone: { not: "" },
        report: { status: "SUBMITTED", reportDate: { gte: new Date(`${monday}T00:00:00Z`), lte: new Date(`${sunday}T00:00:00Z`) } },
      },
      orderBy: [{ report: { reportDate: "asc" } }, { sortOrder: "asc" }],
      select: { title: true, workDone: true, statusAfter: true, report: { select: { reportDate: true } } },
    }),
    db.correspondence.findMany({
      where: { applicationId, clientVisible: true, occurredAt: { gte: range.from, lte: range.to } },
      orderBy: { occurredAt: "asc" },
      select: { kind: true, direction: true, subject: true, occurredAt: true },
    }),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), entries: [] as SharedDayEntry[] }));
  for (const l of lines) {
    days.find((d) => d.date === l.report.reportDate.toISOString().slice(0, 10))?.entries.push({
      type: "work",
      title: l.title,
      text: l.workDone,
      status: l.statusAfter as TaskStatusValue | null,
    });
  }
  for (const c of mail) {
    days.find((d) => d.date === toDateInputValue(c.occurredAt, opts.timeZone))?.entries.push({
      type: "correspondence",
      kind: c.kind,
      direction: c.direction,
      subject: c.subject,
      at: c.occurredAt,
    });
  }

  const [phaseRows, tasks] = await Promise.all([
    db.phase.findMany({ where: { applicationId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.task.findMany({
      where: { applicationId, parentTaskId: null, archived: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        label: true,
        status: true,
        dueDate: true,
        phaseId: true,
        subtasks: { where: { archived: false }, orderBy: { sortOrder: "asc" }, select: { label: true, status: true } },
      },
    }),
  ]);
  const toTask = (t: (typeof tasks)[number]): SharedTask => ({
    title: t.label,
    status: t.status as TaskStatusValue,
    dueDate: t.dueDate,
    subtasks: t.subtasks.map((s) => ({ title: s.label, status: s.status as TaskStatusValue })),
  });
  const phases = phaseRows.map((p) => ({ name: p.name, tasks: tasks.filter((t) => t.phaseId === p.id).map(toTask) }));
  const loose = tasks.filter((t) => !t.phaseId || !phaseRows.some((p) => p.id === t.phaseId));
  if (loose.length) phases.push({ name: phaseRows.length ? "Other" : "", tasks: loose.map(toTask) });
  const all = tasks.flatMap((t) => [t.status, ...t.subtasks.map((s) => s.status)]);

  return {
    clientName: app.client.name,
    applicationName: app.name,
    licenseType: app.licenseTypeTemplate?.name ?? null,
    stage: current ? { name: current.name, hex: current.hex, exit: current.isExitStatus } : null,
    waitingOnClient: current?.role === "WAITING_CLIENT_DOCS",
    updatedAt: app.updatedAt,
    stages,
    history: history.map((h) => ({ stage: h.stage.name, hex: h.stage.hex, at: h.enteredAt })),
    week: { monday, days },
    phases: phases.filter((p) => p.tasks.length > 0),
    progress: { done: all.filter(isClosed).length, total: all.length },
  };
}
