import { after } from "next/server";
import { prisma } from "@/lib/prisma";
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
};

// Fire-and-forget from inside a mutation — never let a notification failure
// break the actual action, and never notify a user about their own action.
export async function notify(entry: NotifyEntry, actorId: string) {
  if (entry.userId === actorId) return;
  await prisma.notification.create({ data: entry });

  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: entry.userId },
        select: { email: true, role: true, emailNotificationsEnabled: true },
      });
      if (!user || !user.emailNotificationsEnabled) return;

      const link = `${getAppUrl()}${entityPath(user.role, entry.entityType, entry.entityId)}`;
      await sendEmail({
        to: user.email,
        subject: entry.message,
        html: renderEmailLayout({
          heading: NOTIFICATION_HEADINGS[entry.type],
          bodyHtml: `<p style="margin:0">${entry.message}</p>`,
          ctaLabel: "View in HCLM",
          ctaUrl: link,
          preheader: entry.message,
        }),
      });
    } catch (error) {
      // A Resend outage or missing config must never surface to the user —
      // the in-app notification above already landed regardless.
      console.error("Failed to send notification email:", error);
    }
  });
}
