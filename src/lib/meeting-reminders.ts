// Fires the 24-hour and 30-minute Calendly meeting reminders — invoked on
// its own interval from src/instrumentation.ts. Three channels, each
// best-effort and independent of the others (a failed Teams post or SMS
// never blocks the rest — same "external dependency must degrade
// gracefully" convention as src/lib/geolocation.ts / wise.ts's
// simulateTransferCompletion / notifications.ts's email send):
//
//   - an in-app notification + email to the Lead's assignedTo, if anyone's
//     assigned (NOT via notify() — see notifyAssignee below for why)
//   - a Teams webhook post naming the assignee (best-effort, skipped
//     entirely — no log noise — when MS_TEAMS_WEBHOOK_URL isn't set)
//   - SMS (and, for the 30-minute reminder only, a phone call) to every
//     User with smsRemindersEnabled — the admin-configured "catch-all"
//     roster from Admin > Users, independent of per-lead assignment
//
// Meant to be invoked every few minutes — see src/instrumentation.ts.
import { prisma } from "@/lib/prisma";
import { sendEmail, renderEmailLayout, getAppUrl } from "@/lib/email";
import { isTeamsConfigured, postTeamsMessage } from "@/lib/teams";
import { isTwilioConfigured, sendSms, placeCall } from "@/lib/twilio";
import type { $Enums, Lead, User } from "@/generated/prisma/client";

type ReminderOffset = {
  hoursBefore: number;
  sentAtField: "reminder24hSentAt" | "reminder30mSentAt";
  label: string;
  alsoCall: boolean; // a call this far out would be excessive; only the near-term reminder places one
};

const OFFSETS: ReminderOffset[] = [
  { hoursBefore: 24, sentAtField: "reminder24hSentAt", label: "24 hours", alsoCall: false },
  { hoursBefore: 0.5, sentAtField: "reminder30mSentAt", label: "30 minutes", alsoCall: true },
];

type LeadWithAssignee = Lead & { assignedTo: Pick<User, "id" | "name" | "email" | "emailNotificationsEnabled"> | null };

// Threshold check ("still upcoming, and now within the offset window"), not
// a narrow [now, now+interval) match — robust to the process being down
// across a tick, since it just catches up on the next poll instead of
// silently skipping a lead whose exact window was missed.
async function dueForOffset(offset: ReminderOffset): Promise<LeadWithAssignee[]> {
  const cutoff = new Date(Date.now() + offset.hoursBefore * 60 * 60 * 1000);
  return prisma.lead.findMany({
    where: {
      canceledAt: null,
      stage: { notIn: ["CONVERTED", "LOST"] satisfies $Enums.LeadStage[] },
      meetingStartAt: { gt: new Date(), lte: cutoff },
      [offset.sentAtField]: null,
    },
    include: { assignedTo: { select: { id: true, name: true, email: true, emailNotificationsEnabled: true } } },
  });
}

// Deliberately NOT notify() — that fire-and-forgets the email via Next's
// after(), which requires a live request context. This function is only
// ever called from a bare setInterval tick (src/instrumentation.ts), with
// no request behind it — after() throws "called outside a request scope"
// there. Same reason sendDueDateDigests calls sendEmail directly instead of
// notify() (see src/lib/due-date-digest.ts): create the in-app row and send
// the email ourselves, respecting the same emailNotificationsEnabled flag
// notify() would have.
async function notifyAssignee(lead: LeadWithAssignee, label: string) {
  if (!lead.assignedToId || !lead.assignedTo) return; // nothing to notify — no owner set
  const message = `Meeting with ${lead.inviteeName} in ${label}`;

  await prisma.notification.create({
    data: { userId: lead.assignedToId, type: "MEETING_REMINDER", message, entityType: "Lead", entityId: lead.id },
  });

  if (!lead.assignedTo.emailNotificationsEnabled) return;
  try {
    await sendEmail({
      to: lead.assignedTo.email,
      subject: message,
      html: renderEmailLayout({
        heading: "Meeting reminder",
        bodyHtml: `<p style="margin:0">${message}</p>`,
        ctaLabel: "View in HCLM",
        ctaUrl: `${getAppUrl()}/leads`,
        preheader: message,
      }),
    });
  } catch (error) {
    console.error(`Failed to send meeting-reminder email for lead ${lead.id}:`, error);
  }
}

async function tryTeams(lead: LeadWithAssignee, label: string) {
  if (!isTeamsConfigured()) return;
  const who = lead.assignedTo ? lead.assignedTo.name : "Unassigned";
  const text = `Meeting with ${lead.inviteeName} in ${label} — assigned to ${who}.`;
  try {
    await postTeamsMessage(text);
  } catch (error) {
    console.error(`Failed to post Teams reminder for lead ${lead.id}:`, error);
  }
}

async function tryTexts(lead: LeadWithAssignee, label: string, roster: User[], alsoCall: boolean) {
  if (!isTwilioConfigured() || roster.length === 0) return;
  const message = `HCLM: meeting with ${lead.inviteeName} in ${label}.`;
  for (const user of roster) {
    if (!user.phone) continue;
    try {
      await sendSms(user.phone, message);
    } catch (error) {
      console.error(`Failed to send SMS reminder to ${user.id} for lead ${lead.id}:`, error);
    }
    if (alsoCall) {
      try {
        await placeCall(user.phone, message);
      } catch (error) {
        console.error(`Failed to place call reminder to ${user.id} for lead ${lead.id}:`, error);
      }
    }
  }
}

export async function sendMeetingReminders() {
  const smsRoster = await prisma.user.findMany({
    where: { smsRemindersEnabled: true, active: true, phone: { not: null } },
  });

  for (const offset of OFFSETS) {
    const leads = await dueForOffset(offset);
    for (const lead of leads) {
      await notifyAssignee(lead, offset.label);
      await tryTeams(lead, offset.label);
      await tryTexts(lead, offset.label, smsRoster, offset.alsoCall);

      // Marked sent regardless of whether any channel above actually
      // succeeded — this field's job is "don't re-process this lead/offset
      // every tick," not "retry until every channel confirms delivery."
      // Each channel already logs and moves on independently.
      await prisma.lead.update({ where: { id: lead.id }, data: { [offset.sentAtField]: new Date() } });
    }
  }
}
