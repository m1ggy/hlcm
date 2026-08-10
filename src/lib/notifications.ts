import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, getAppUrl } from "@/lib/email";
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
        html: `<p>${entry.message}</p><p><a href="${link}">View in HCLM</a></p>`,
      });
    } catch (error) {
      // A Resend outage or missing config must never surface to the user —
      // the in-app notification above already landed regardless.
      console.error("Failed to send notification email:", error);
    }
  });
}
