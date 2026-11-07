import { db } from "@/lib/db";
import { getOrgBySlug } from "@/lib/tenant";
import { renderEmailLayout, getEmailBranding, sendEmail } from "@/lib/email";
import { DEFAULT_TIMEZONE, dayRangeToInstants } from "@/lib/time-entries";
import { canManageEods, eodRequiredFor, eodToday } from "@/lib/eod";
import type { $Enums } from "@/generated/prisma/client";

// The 6 pm EOD reminder (docs/client-portal-eod-plan.md, decided D4): people
// expected to submit who worked today (clocked in, timed a task or started a
// report) and haven't submitted get a nudge at 6 pm their time; managers get
// one list of who's missing at 6 pm workspace time. Run hourly per org
// (src/instrumentation.ts) inside its tenant scope; each reminder is one
// notification row per person per day, which is also the "already sent" mark.

export const EOD_REMINDER_HOUR = 18;

function localHour(timeZone: string, now: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

async function remind(user: { id: string; email: string; emailNotificationsEnabled: boolean }, type: $Enums.NotificationType, entityType: string, day: string, message: string, path: string) {
  const sent = await db.notification.findFirst({ where: { userId: user.id, type, entityType, entityId: day }, select: { id: true } });
  if (sent) return false;
  await db.notification.create({ data: { userId: user.id, type, message, entityType, entityId: day } });
  if (!user.emailNotificationsEnabled) return true;
  try {
    const { appUrl, brand } = await getEmailBranding();
    await sendEmail({
      to: user.email,
      subject: message,
      html: renderEmailLayout({
        heading: type === "EOD_REMINDER" ? "End-of-day report" : "Missing end-of-day reports",
        bodyHtml: `<p style="margin:0">${message}</p>`,
        ctaLabel: `Open in ${brand}`,
        ctaUrl: `${appUrl}${path}`,
        preheader: message,
        appUrl,
        brand,
      }),
    });
  } catch (error) {
    console.error("Failed to send EOD reminder email:", error);
  }
  return true;
}

export async function runEodReminders(orgSlug: string, now = new Date()) {
  const org = await getOrgBySlug(orgSlug);
  if (!org || org.kind === "TASKS") return { reminded: 0, managers: 0 };
  const orgTz = org.timezone || DEFAULT_TIMEZONE;

  const people = await db.user.findMany({
    where: { active: true, isSupport: false, assignedFromUserId: null },
    select: { id: true, name: true, email: true, role: true, timezone: true, eodRequired: true, emailNotificationsEnabled: true },
  });
  let reminded = 0;
  const missing: string[] = [];
  const orgDay = eodToday(orgTz, now);

  for (const p of people.filter(eodRequiredFor)) {
    const tz = p.timezone || orgTz;
    const day = eodToday(tz, now);
    const report = await db.eodReport.findUnique({ where: { userId_reportDate: { userId: p.id, reportDate: new Date(`${day}T00:00:00Z`) } }, select: { status: true } });
    if (report?.status === "SUBMITTED") continue;
    const range = dayRangeToInstants(day, day, tz);
    const worked =
      Boolean(report) ||
      (await db.timeEntry.count({ where: { userId: p.id, clockIn: { gte: range.from, lte: range.to } } })) > 0 ||
      (await db.taskTimeEntry.count({ where: { userId: p.id, startedAt: { gte: range.from, lte: range.to } } })) > 0;
    if (!worked) continue;
    if (day === orgDay) missing.push(p.name);
    if (localHour(tz, now) < EOD_REMINDER_HOUR) continue;
    const message = report ? "Your end-of-day report is still a draft — finish and submit it" : "Don't forget your end-of-day report";
    if (await remind(p, "EOD_REMINDER", "Eod", day, message, `/eod?date=${day}`)) reminded++;
  }

  let managers = 0;
  if (missing.length && localHour(orgTz, now) >= EOD_REMINDER_HOUR) {
    const names = missing.sort((a, b) => a.localeCompare(b));
    const message = `${names.length} ${names.length === 1 ? "person hasn't" : "people haven't"} submitted today's end-of-day report: ${names.join(", ")}`;
    for (const m of people.filter((p) => canManageEods(p.role) && p.role !== "DEVELOPER")) {
      if (await remind(m, "EOD_REMINDER", "EodTeam", orgDay, message, `/eod/team?date=${orgDay}`)) managers++;
    }
  }
  return { reminded, managers };
}
