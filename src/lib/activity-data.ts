import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { ForbiddenError, requireSession } from "@/lib/rbac";
import { canViewTeamActivity, currentMonitoring, isTrackablePerson } from "@/lib/activity-monitoring";
import { dayRangeToInstants, effectiveTimezone, toDateInputValue } from "@/lib/time-entries";
import {
  EMPTY_SCORE,
  addScores,
  appTotals,
  clipInterval,
  percent,
  rulesForUser,
  scoreInterval,
  type AppTotal,
  type AppUsage,
  type IntervalInput,
  type Score,
  type ScoringRule,
} from "@/lib/activity-scoring";
import type { Prisma, Role } from "@/generated/prisma/client";

// Read side of the desktop activity tracker: what Admin > Activity and the
// self-view at /time/activity show, for the current workspace only.
// Monitoring data is the workspace OWNER's or a DEVELOPER's, plus each
// person's own. Screenshot views by anyone other than the person are audited.

/** OWNER/DEVELOPER only. Throws ForbiddenError otherwise. */
export async function requireMonitoringViewer() {
  const session = await requireSession();
  if (!canViewTeamActivity(session.user.role)) throw new ForbiddenError();
  if (!(await currentMonitoring()).on) throw new ForbiddenError();
  return session;
}

/** OWNER/DEVELOPER, or the user looking at their own data. */
async function requireActivityAccess(userId: string) {
  const session = await requireSession();
  if (session.user.id !== userId && !canViewTeamActivity(session.user.role)) throw new ForbiddenError();
  if (!(await currentMonitoring()).on) throw new ForbiddenError();
  return session;
}

const STALE_HEARTBEAT_MS = 3 * 60 * 1000;

// The workspace's own people in tracked roles: never a linked account (a
// managing company's staff, tracked at home) or a platform support account.
const TRACKED_PEOPLE: Prisma.UserWhereInput = {
  role: { notIn: ["CAREGIVER", "CLIENT"] as Role[] },
  isSupport: false,
  assignedFromUserId: null,
};

export function scoreSummary(score: Score) {
  return {
    trackedSec: score.trackedSec,
    productivityPct: percent(score.productiveSec, score.trackedSec),
    unproductivePct: percent(score.unproductiveSec, score.trackedSec),
  };
}

export type ScoreSummary = ReturnType<typeof scoreSummary>;

async function loadRules(): Promise<ScoringRule[]> {
  const rules = await db.productivityRule.findMany({
    select: { id: true, matchType: true, pattern: true, category: true, priority: true, enabled: true, roles: true, userId: true },
  });
  return rules;
}

function toIntervalInput(row: { start: Date; end: Date; apps: unknown }): IntervalInput {
  return { ...row, apps: Array.isArray(row.apps) ? (row.apps as AppUsage[]) : [] };
}

/**
 * Intervals for one user that overlap [from, to], each clipped to its
 * session and to the window. Queried by user + time rather than by entry
 * id, since an admin "Add break" split leaves intervals linked to the first
 * half of the session.
 */
async function clippedIntervals(userIds: string[], from: Date, to: Date) {
  const [rows, entries] = await Promise.all([
    db.activityInterval.findMany({
      where: { userId: { in: userIds }, start: { lt: to }, end: { gt: from } },
      orderBy: { start: "asc" },
      select: { id: true, userId: true, start: true, end: true, apps: true },
    }),
    db.timeEntry.findMany({
      where: { userId: { in: userIds }, clockIn: { lt: to }, OR: [{ clockOut: null }, { clockOut: { gt: from } }] },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
  ]);
  const now = new Date();
  const result: (IntervalInput & { id: string; userId: string })[] = [];
  for (const row of rows) {
    const input = toIntervalInput(row);
    // The session this interval sits in, after any split: the one it
    // overlaps most. (The no-input clock-out is back-dated, so the
    // interval can run well past its session's end.)
    let session: (typeof entries)[number] | null = null;
    let best = 0;
    for (const e of entries) {
      if (e.userId !== row.userId) continue;
      const overlap = Math.min(row.end.getTime(), (e.clockOut ?? now).getTime()) - Math.max(row.start.getTime(), e.clockIn.getTime());
      if (overlap > best) {
        best = overlap;
        session = e;
      }
    }
    if (!session) continue;
    const clipped = clipInterval(input, session, now);
    const windowed = clipped && clipInterval(clipped, { clockIn: from, clockOut: to }, now);
    if (windowed) result.push({ ...windowed, id: row.id, userId: row.userId });
  }
  return result;
}

function workedSeconds(entries: { clockIn: Date; clockOut: Date | null }[], from: Date, to: Date) {
  const now = Date.now();
  let total = 0;
  for (const e of entries) {
    const start = Math.max(e.clockIn.getTime(), from.getTime());
    const end = Math.min((e.clockOut?.getTime() ?? now), to.getTime());
    if (end > start) total += (end - start) / 1000;
  }
  return Math.round(total);
}

export type TeamRow = {
  id: string;
  name: string;
  role: string;
  requireDesktopClock: boolean;
  workedSec: number;
  score: ScoreSummary;
  /** stale: the app hasn't checked in for 3+ minutes (offline or closed; auto clock-out at 15). */
  open: { since: string; source: string; deviceName: string | null; stale: boolean; onBreak: boolean } | null;
  devices: number;
  lastSeenAt: string | null;
  latestScreenshotId: string | null;
  latestScreenshotAt: string | null;
};

/** Every tracked user for one day (in the viewer's timezone): who is on the clock now and how the day went. */
export async function getTeamActivity(day?: string) {
  const session = await requireMonitoringViewer();
  const viewer = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { timezone: true } });
  const timeZone = effectiveTimezone(viewer.timezone);
  const date = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : toDateInputValue(new Date(), timeZone);
  const { from, to } = dayRangeToInstants(date, date, timeZone);

  const users = await db.user.findMany({
    where: { active: true, ...TRACKED_PEOPLE },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      requireDesktopClock: true,
      agentDevices: { where: { revokedAt: null }, select: { lastSeenAt: true } },
    },
  });
  const ids = users.map((u) => u.id);

  const [rules, intervals, entries, openEntries, openBreaks, latestShots] = await Promise.all([
    loadRules(),
    clippedIntervals(ids, from, to),
    db.timeEntry.findMany({
      where: { userId: { in: ids }, clockIn: { lt: to }, OR: [{ clockOut: null }, { clockOut: { gt: from } }] },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    db.timeEntry.findMany({
      where: { userId: { in: ids }, clockOut: null },
      select: { userId: true, clockIn: true, source: true, lastHeartbeatAt: true, agentDevice: { select: { name: true } } },
    }),
    db.breakEntry.findMany({ where: { userId: { in: ids }, breakEnd: null }, select: { userId: true, breakStart: true } }),
    db.screenshot.findMany({
      where: { userId: { in: ids }, deletedAt: null, takenAt: { gte: from, lte: to } },
      orderBy: { takenAt: "desc" },
      distinct: ["userId"],
      select: { id: true, userId: true, takenAt: true },
    }),
  ]);

  const rows: TeamRow[] = users.map((user) => {
    const sorted = rulesForUser(rules, user);
    const score = intervals.filter((i) => i.userId === user.id).reduce((acc, i) => addScores(acc, scoreInterval(i, sorted)), EMPTY_SCORE);
    const open = openEntries.find((e) => e.userId === user.id);
    const onBreak = openBreaks.find((b) => b.userId === user.id);
    const shot = latestShots.find((s) => s.userId === user.id);
    const lastSeen = user.agentDevices.map((d) => d.lastSeenAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      requireDesktopClock: user.requireDesktopClock,
      workedSec: workedSeconds(entries.filter((e) => e.userId === user.id), from, to),
      score: scoreSummary(score),
      open: open
        ? {
            since: open.clockIn.toISOString(),
            source: open.source,
            deviceName: open.agentDevice?.name ?? null,
            stale: open.source === "AGENT" && Date.now() - (open.lastHeartbeatAt ?? open.clockIn).getTime() > STALE_HEARTBEAT_MS,
            onBreak: false,
          }
        : onBreak
          ? { since: onBreak.breakStart.toISOString(), source: "BREAK", deviceName: null, stale: false, onBreak: true }
          : null,
      devices: user.agentDevices.length,
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
      latestScreenshotId: shot?.id ?? null,
      latestScreenshotAt: shot?.takenAt.toISOString() ?? null,
    };
  });

  return { date, timeZone, rows };
}

export type DayBlock = {
  id: string;
  start: string;
  end: string;
  score: ScoreSummary;
};

export type ScreenshotGroup = { takenAt: string; deviceName: string; ids: string[] };

/**
 * One user's day: sessions, 30-minute activity blocks, screenshots and
 * app usage. `day` is "yyyy-MM-dd" in the user's own timezone.
 */
export async function getActivityDay(userId: string, day?: string) {
  const session = await requireActivityAccess(userId);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, timezone: true, requireDesktopClock: true, active: true, isSupport: true, assignedFromUserId: true },
  });
  if (!user) throw new ForbiddenError();

  const timeZone = effectiveTimezone(user.timezone);
  const date = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : toDateInputValue(new Date(), timeZone);
  const { from, to } = dayRangeToInstants(date, date, timeZone);

  const [rules, intervals, entries, breaks, shots] = await Promise.all([
    loadRules(),
    clippedIntervals([userId], from, to),
    db.timeEntry.findMany({
      where: { userId, clockIn: { lt: to }, OR: [{ clockOut: null }, { clockOut: { gt: from } }] },
      orderBy: { clockIn: "asc" },
      select: { id: true, clockIn: true, clockOut: true, source: true, autoClosed: true, agentDevice: { select: { name: true } } },
    }),
    db.breakEntry.findMany({
      where: { userId, breakStart: { lt: to }, OR: [{ breakEnd: null }, { breakEnd: { gt: from } }] },
      orderBy: { breakStart: "asc" },
      select: { id: true, breakStart: true, breakEnd: true },
    }),
    db.screenshot.findMany({
      where: { userId, deletedAt: null, takenAt: { gte: from, lte: to } },
      orderBy: { takenAt: "asc" },
      select: { id: true, takenAt: true, deviceId: true, device: { select: { name: true } } },
    }),
  ]);

  const sorted = rulesForUser(rules, user);
  const blocks: DayBlock[] = intervals.map((i) => ({
    id: i.id,
    start: i.start.toISOString(),
    end: i.end.toISOString(),
    score: scoreSummary(scoreInterval(i, sorted)),
  }));
  const total = intervals.reduce((acc, i) => addScores(acc, scoreInterval(i, sorted)), EMPTY_SCORE);
  const apps: AppTotal[] = appTotals(intervals, sorted);

  // The app saves one row per monitor with the same takenAt; show them together.
  const groups: ScreenshotGroup[] = [];
  for (const shot of shots) {
    const last = groups[groups.length - 1];
    const takenAt = shot.takenAt.toISOString();
    if (last && last.takenAt === takenAt && last.deviceName === shot.device.name) last.ids.push(shot.id);
    else groups.push({ takenAt, deviceName: shot.device.name, ids: [shot.id] });
  }

  if (session.user.id !== userId && shots.length > 0) {
    await recordAudit({ entityType: "User", entityId: userId, action: "view_activity_screenshots", actorId: session.user.id, newValue: date });
  }

  return {
    user: { id: user.id, name: user.name, role: user.role, requireDesktopClock: user.requireDesktopClock, tracked: isTrackablePerson(user) },
    date,
    timeZone,
    workedSec: workedSeconds(entries, from, to),
    score: scoreSummary(total),
    entries: entries.map((e) => ({
      id: e.id,
      clockIn: e.clockIn.toISOString(),
      clockOut: e.clockOut?.toISOString() ?? null,
      source: e.source,
      autoClosed: e.autoClosed,
      deviceName: e.agentDevice?.name ?? null,
    })),
    breaks: breaks.map((b) => ({ id: b.id, breakStart: b.breakStart.toISOString(), breakEnd: b.breakEnd?.toISOString() ?? null })),
    blocks,
    apps,
    screenshots: groups,
  };
}

export type ActivityDay = Awaited<ReturnType<typeof getActivityDay>>;

/** Desktop app installs for one user. */
export async function listUserDevices(userId: string) {
  await requireActivityAccess(userId);
  const devices = await db.agentDevice.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, os: true, appVersion: true, lastSeenAt: true, lastIp: true, revokedAt: true, createdAt: true },
  });
  return devices.map((d) => ({
    ...d,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function listProductivityRules() {
  await requireMonitoringViewer();
  const rules = await db.productivityRule.findMany({
    orderBy: [{ enabled: "desc" }, { priority: "desc" }, { pattern: "asc" }],
    include: { user: { select: { id: true, name: true } } },
  });
  return rules.map((r) => ({
    id: r.id,
    matchType: r.matchType,
    pattern: r.pattern,
    category: r.category,
    roles: r.roles as string[],
    userId: r.userId,
    userName: r.user?.name ?? null,
    priority: r.priority,
    enabled: r.enabled,
  }));
}

export type RuleRow = Awaited<ReturnType<typeof listProductivityRules>>[number];

/**
 * Apps and sites no enabled rule covers, across everyone's last `days` days,
 * longest first, so the owner can classify the ones that matter.
 */
export async function listUnclassifiedApps(days = 7, limit = 30) {
  await requireMonitoringViewer();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [rules, rows] = await Promise.all([
    loadRules(),
    db.activityInterval.findMany({ where: { start: { gte: since } }, select: { apps: true, userId: true } }),
  ]);
  // Any enabled rule counts as covering it, whatever its scope.
  const all = rulesForUser(
    rules.map((r) => ({ ...r, userId: null, roles: [] })),
    { id: "", role: "" }
  );
  const intervals = rows.map((r) => ({ start: new Date(0), end: new Date(0), apps: Array.isArray(r.apps) ? (r.apps as AppUsage[]) : [] }));
  const usersByKey = new Map<string, Set<string>>();
  rows.forEach((r, i) => {
    for (const usage of intervals[i].apps) {
      const key = usage.domain ? `d:${usage.domain.toLowerCase()}` : `a:${usage.app.toLowerCase()}`;
      if (!usersByKey.has(key)) usersByKey.set(key, new Set());
      usersByKey.get(key)!.add(r.userId);
    }
  });
  return appTotals(intervals, all, 3)
    .filter((a) => a.ruleId === null && a.app !== "Unknown" && a.app !== "Other")
    .slice(0, limit)
    .map((a) => ({ ...a, users: usersByKey.get(a.domain ? `d:${a.domain}` : `a:${a.app.toLowerCase()}`)?.size ?? 0 }));
}

/** Tracked users for the rule scope picker. */
export async function listTrackedUsers() {
  await requireMonitoringViewer();
  return db.user.findMany({ where: { active: true, ...TRACKED_PEOPLE }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** A screenshot's storage keys, after the access check. Views by anyone but the user are audited. */
export async function getScreenshotForView(id: string, size: "thumb" | "full") {
  const session = await requireSession();
  const shot = await db.screenshot.findUnique({ where: { id }, select: { id: true, userId: true, storageKey: true, thumbKey: true, deletedAt: true } });
  if (!shot || shot.deletedAt) throw new ForbiddenError();
  if (shot.userId !== session.user.id && !canViewTeamActivity(session.user.role)) throw new ForbiddenError();
  if (size === "full" && shot.userId !== session.user.id) {
    await recordAudit({ entityType: "Screenshot", entityId: shot.id, action: "view", actorId: session.user.id });
  }
  return size === "full" ? shot.storageKey : shot.thumbKey;
}

const MAX_REPORT_DAYS = 92;

/**
 * Totals per person and per person-day over a date range (viewer's
 * timezone), for the Activity CSV/Excel/PDF export. OWNER/DEVELOPER only.
 */
export async function getActivityReport(fromDay: string, toDay: string) {
  const session = await requireMonitoringViewer();
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(fromDay) || !day.test(toDay) || fromDay > toDay) throw new ForbiddenError("Pick a valid date range");
  const viewer = await db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { timezone: true } });
  const timeZone = effectiveTimezone(viewer.timezone);
  const { from, to } = dayRangeToInstants(fromDay, toDay, timeZone);
  if (to.getTime() - from.getTime() > MAX_REPORT_DAYS * 24 * 60 * 60 * 1000) throw new ForbiddenError(`Pick at most ${MAX_REPORT_DAYS} days`);

  const users = await db.user.findMany({
    where: { ...TRACKED_PEOPLE, OR: [{ active: true }, { activityIntervals: { some: { start: { lt: to }, end: { gt: from } } } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  const ids = users.map((u) => u.id);
  const [rules, intervals, entries] = await Promise.all([
    loadRules(),
    clippedIntervals(ids, from, to),
    db.timeEntry.findMany({
      where: { userId: { in: ids }, clockIn: { lt: to }, OR: [{ clockOut: null }, { clockOut: { gt: from } }] },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
  ]);

  const people = users.map((user) => {
    const sorted = rulesForUser(rules, user);
    const mine = intervals.filter((i) => i.userId === user.id);
    const myEntries = entries.filter((e) => e.userId === user.id);
    const days = new Map<string, typeof mine>();
    for (const i of mine) {
      const key = toDateInputValue(i.start, timeZone);
      days.set(key, [...(days.get(key) ?? []), i]);
    }
    const workedDays = new Set(myEntries.map((e) => toDateInputValue(e.clockIn, timeZone)));
    const dayKeys = [...new Set([...days.keys(), ...workedDays])].filter((d) => d >= fromDay && d <= toDay).sort();
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      workedSec: workedSeconds(myEntries, from, to),
      score: scoreSummary(mine.reduce((acc, i) => addScores(acc, scoreInterval(i, sorted)), EMPTY_SCORE)),
      topApps: appTotals(mine, sorted, 0).slice(0, 3).map((a) => a.label),
      days: dayKeys.map((d) => {
        const range = dayRangeToInstants(d, d, timeZone);
        const list = days.get(d) ?? [];
        return {
          date: d,
          workedSec: workedSeconds(myEntries, range.from, range.to),
          score: scoreSummary(list.reduce((acc, i) => addScores(acc, scoreInterval(i, sorted)), EMPTY_SCORE)),
        };
      }),
    };
  });

  return { from: fromDay, to: toDay, timeZone, people };
}
