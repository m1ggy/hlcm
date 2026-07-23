import { prisma } from "@/lib/prisma";
import type { $Enums } from "@/generated/prisma/client";

type NotifyEntry = {
  userId: string;
  type: $Enums.NotificationType;
  message: string;
  entityType: string;
  entityId: string;
};

// Fire-and-forget from inside a mutation — never let a notification failure
// break the actual action, and never notify a user about their own action.
export async function notify(entry: NotifyEntry, actorId: string) {
  if (entry.userId === actorId) return;
  await prisma.notification.create({ data: entry });
}
