import { after } from "next/server";
import { currentOrg, db, runAsTenant } from "@/lib/db";
import { sendEmail, renderEmailLayout, getAppUrl } from "@/lib/email";
import { ENTITY_LINKS } from "@/lib/entity-links";
import type { $Enums } from "@/generated/prisma/client";

type NotifyEntry = {
  userId: string;
  type: $Enums.NotificationType;
  message: string;
  entityType: string;
  entityId: string;
};

function entityPath(role: string, entityType: string, entityId: string) {
  const variant = role === "CLIENT" ? "portal" : "staff";
  return ENTITY_LINKS[variant][entityType]?.(entityId) ?? "/";
}

// Short label shown above the message in the email — the message itself
// already reads as a full sentence (see every notify() call site), this
// just gives the reader a category to scan before reading it.
const NOTIFICATION_HEADINGS: Record<$Enums.NotificationType, string> = {
  TASK_ASSIGNED: "Task assigned to you",
  TASK_REASSIGNED: "Task assigned to you",
  TASK_REVIEW_REQUESTED: "Review requested",
  TASK_STATUS_CHANGED: "Task status changed",
  APPLICATION_STATUS_CHANGED: "Status update",
  APPLICATION_SHARED: "You've been given access",
  MENTIONED: "You were mentioned",
  INVOICE_PAID: "Invoice paid",
  LEAD_BOOKED: "New lead booked",
  LEAD_CANCELED: "Lead canceled",
  MEETING_REMINDER: "Meeting reminder",
  ENVELOPE_COMPLETED: "Envelope signed",
  ENVELOPE_DECLINED: "Envelope declined",
};

// Fire-and-forget from inside a mutation — never let a notification failure
// break the actual action, and never notify a user about their own action.
export async function notify(entry: NotifyEntry, actorId: string) {
  if (entry.userId === actorId) return;
  await db.notification.create({ data: entry });

  // after() runs once the response is sent, where the request host may no
  // longer be readable (Server Components can't use request APIs in after()),
  // so pin the tenant now and re-enter it explicitly.
  const org = await currentOrg();
  after(() => runAsTenant(org, async () => {
    try {
      const user = await db.user.findUnique({
        where: { id: entry.userId },
        select: { email: true, role: true, emailNotificationsEnabled: true },
      });
      if (!user || !user.emailNotificationsEnabled) return;

      const appUrl = await getAppUrl();
      const link = `${appUrl}${entityPath(user.role, entry.entityType, entry.entityId)}`;
      await sendEmail({
        to: user.email,
        subject: entry.message,
        html: renderEmailLayout({
          heading: NOTIFICATION_HEADINGS[entry.type],
          bodyHtml: `<p style="margin:0">${entry.message}</p>`,
          ctaLabel: "View in HCLM",
          ctaUrl: link,
          preheader: entry.message,
          appUrl,
        }),
      });
    } catch (error) {
      // A Resend outage or missing config must never surface to the user —
      // the in-app notification above already landed regardless.
      console.error("Failed to send notification email:", error);
    }
  }));
}
