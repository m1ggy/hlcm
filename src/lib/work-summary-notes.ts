import { db } from "@/lib/db";
import { getOrgBySlug } from "@/lib/tenant";
import { UserFacingError } from "@/lib/user-facing-error";
import { recordAudit } from "@/lib/audit";
import { renderEmailLayout, getEmailBranding, sendEmail } from "@/lib/email";
import { DEFAULT_TIMEZONE, toDateInputValue } from "@/lib/time-entries";
import type { WorkActor } from "@/lib/work-service";
import { addDays, dayHasActivity, dayHeadline, getWeekSummary, weekStartOf, type WeekSummary } from "@/lib/work-summary";
import { aiSummariesConfigured, writeDayNote, writeWeekNote } from "@/lib/work-ai";

// Written notes on the client's weekly summary, the hourly job that has
// Claude write them, and the Monday email (docs/workspace-tasks-plan.md,
// Phase 3). No Next.js imports, so tests and the instrumentation job can
// call these inside runAsTenant.

type Period = "DAY" | "WEEK";
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function requireEditor(actor: WorkActor) {
  if (!actor.scope.canManageProjects) throw new UserFacingError("Only the team's managers can change the summary");
}

/** A person writes or edits a note. Editing Claude's note marks it EDITED, so it's never overwritten automatically. An empty note removes it. */
export async function saveSummaryNote(actor: WorkActor, period: Period, day: string, body: string) {
  requireEditor(actor);
  const date = asDate(period === "WEEK" ? weekStartOf(day) : day);
  const text = body.trim();
  const existing = await db.workSummaryNote.findFirst({ where: { period, date } });
  if (!text) {
    if (existing) await db.workSummaryNote.update({ where: { id: existing.id }, data: { body: "", source: "HUMAN", authorId: actor.userId } });
  } else if (existing) {
    await db.workSummaryNote.update({
      where: { id: existing.id },
      data: { body: text, source: existing.source === "HUMAN" ? "HUMAN" : "EDITED", authorId: actor.userId },
    });
  } else {
    await db.workSummaryNote.create({ data: { period, date, body: text, source: "HUMAN", authorId: actor.userId } });
  }
  await recordAudit({ entityType: "WorkSummaryNote", entityId: `${period}:${day}`, action: "update", actorId: actor.userId, newValue: text.slice(0, 500) });
}

async function storeAiNote(period: Period, date: Date, body: string, opts: { overwrite: boolean }) {
  const existing = await db.workSummaryNote.findFirst({ where: { period, date } });
  if (!existing) {
    await db.workSummaryNote.create({ data: { period, date, body, source: "AI" } });
  } else if (opts.overwrite || (existing.source === "AI" && !existing.body.trim())) {
    await db.workSummaryNote.update({ where: { id: existing.id }, data: { body, source: "AI", authorId: null } });
  }
}

/** "Write with AI" / "Rewrite": replaces the note with a fresh Claude-written one. */
export async function regenerateSummaryNote(
  actor: WorkActor,
  org: { name: string; timezone: string | null; workAiSummaries: boolean },
  period: Period,
  day: string
) {
  requireEditor(actor);
  if (!aiSummariesConfigured()) throw new UserFacingError("AI summaries aren't set up on this server yet");
  if (!org.workAiSummaries) throw new UserFacingError("AI summaries are turned off for this workspace");
  const monday = weekStartOf(day);
  const week = await getWeekSummary({ monday, timeZone: org.timezone || DEFAULT_TIMEZONE, orgKind: actor.orgKind, withHours: false });
  const text =
    period === "WEEK" ? await writeWeekNote(week.days, org.name) : await writeDayNote(week.days.find((d) => d.date === day)!, org.name);
  if (!text) throw new UserFacingError("There's nothing to summarize yet, or the AI service didn't answer. Try again in a minute.");
  await storeAiNote(period, asDate(period === "WEEK" ? monday : day), text, { overwrite: true });
  await recordAudit({ entityType: "WorkSummaryNote", entityId: `${period}:${day}`, action: "regenerate", actorId: actor.userId });
  return text;
}

// ---- The hourly job ---------------------------------------------------------

/** After this local hour, today counts as over and gets its note. */
export const DAY_NOTE_HOUR = 19;
/** The Monday email goes out after this local hour. */
export const WEEKLY_EMAIL_HOUR = 8;

function localNow(timeZone: string, now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return { today: toDateInputValue(now, timeZone), hour };
}

/**
 * For one workspace (call inside runAsTenant): Claude writes any missing
 * notes for the last seven finished days and the last finished week, then
 * the Monday email goes out. Safe to run every hour: notes are written once
 * and the email is marked sent.
 */
export async function runSummaryJob(orgSlug: string, now = new Date()) {
  const org = await getOrgBySlug(orgSlug);
  if (!org || org.kind !== "TASKS") return;
  const timeZone = org.timezone || DEFAULT_TIMEZONE;
  const { today, hour } = localNow(timeZone, now);
  const thisMonday = weekStartOf(today);
  const lastMonday = addDays(thisMonday, -7);

  if (org.workAiSummaries && aiSummariesConfigured()) {
    const existing = await db.workSummaryNote.findMany({
      where: { period: "DAY", date: { gte: asDate(addDays(today, -7)), lte: asDate(today) } },
      select: { date: true },
    });
    const have = new Set(existing.map((n) => n.date.toISOString().slice(0, 10)));
    const weeks = new Map<string, WeekSummary>();
    const weekOf = async (monday: string) => {
      if (!weeks.has(monday)) weeks.set(monday, await getWeekSummary({ monday, timeZone, orgKind: org.kind, withHours: false }));
      return weeks.get(monday)!;
    };
    for (let i = 7; i >= 0; i--) {
      const day = addDays(today, -i);
      if (have.has(day) || (i === 0 && hour < DAY_NOTE_HOUR)) continue;
      const summary = (await weekOf(weekStartOf(day))).days.find((d) => d.date === day)!;
      if (!dayHasActivity(summary)) continue;
      const text = await writeDayNote(summary, org.name);
      if (text) await storeAiNote("DAY", asDate(day), text, { overwrite: false });
    }
    const weekNote = await db.workSummaryNote.findFirst({ where: { period: "WEEK", date: asDate(lastMonday) } });
    if (!weekNote?.body.trim() && (!weekNote || weekNote.source === "AI")) {
      const text = await writeWeekNote((await weekOf(lastMonday)).days, org.name);
      if (text) await storeAiNote("WEEK", asDate(lastMonday), text, { overwrite: false });
    }
  }

  if (org.workWeeklyEmail && hour >= WEEKLY_EMAIL_HOUR) await sendWeeklyEmail(org, lastMonday, timeZone);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The Monday email of last week, once, to the client's own people. Quiet weeks are skipped. */
async function sendWeeklyEmail(org: { name: string; kind: "FULL" | "TASKS"; workShowHoursToClient: boolean }, monday: string, timeZone: string) {
  const marker = await db.workSummaryNote.findFirst({ where: { period: "WEEK", date: asDate(monday) } });
  if (marker?.emailedAt) return;
  const week = await getWeekSummary({ monday, timeZone, orgKind: org.kind, withHours: org.workShowHoursToClient });
  // Mark it first: a failed send isn't retried every hour into someone's inbox.
  if (marker) await db.workSummaryNote.update({ where: { id: marker.id }, data: { emailedAt: new Date() } });
  else await db.workSummaryNote.create({ data: { period: "WEEK", date: asDate(monday), body: "", source: "AI", emailedAt: new Date() } });
  if (!week.days.some(dayHasActivity)) return;

  const recipients = await db.user.findMany({
    where: { active: true, isSupport: false, assignedFromUserId: null, emailNotificationsEnabled: true, role: { not: "CAREGIVER" } },
    select: { email: true },
  });
  if (recipients.length === 0) return;

  const { appUrl, brand } = await getEmailBranding();
  const t = week.totals;
  const stats = [
    `${t.completed} finished`,
    `${t.progressed} moved forward`,
    t.added ? `${t.added} new` : null,
    t.hours !== null ? `${t.hours}h of work` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const dayRows = week.days
    .filter(dayHasActivity)
    .map((d) => {
      const text = d.note?.body ?? dayHeadline(d) ?? "";
      return `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;white-space:nowrap;font-weight:600;color:#121c2b">${dayLabel(d.date)}</td><td style="padding:6px 0;color:#121c2b">${escapeHtml(text)}</td></tr>`;
    })
    .join("");
  const link = `${appUrl}/work/summary?week=${monday}`;
  const bodyHtml =
    `<p style="margin:0 0 12px;font-weight:600">Week of ${dayLabel(monday)} to ${dayLabel(week.to)}</p>` +
    `<p style="margin:0 0 12px;color:#4a5668">${escapeHtml(stats)}</p>` +
    (week.note ? `<p style="margin:0 0 16px">${escapeHtml(week.note.body)}</p>` : "") +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5">${dayRows}</table>`;

  await sendEmail({
    to: recipients.map((r) => r.email),
    subject: `Your week with ${brand}: ${stats}`,
    html: renderEmailLayout({
      heading: "Weekly summary",
      bodyHtml,
      ctaLabel: "See the full week",
      ctaUrl: link,
      preheader: week.note?.body.slice(0, 140) ?? stats,
      appUrl,
      brand,
    }),
  });
}
