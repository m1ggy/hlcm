"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";

export async function listNotifications() {
  const session = await requireSession();
  return db.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function countUnreadNotifications() {
  const session = await requireSession();
  return db.notification.count({ where: { userId: session.user.id, read: false } });
}

export async function markNotificationRead(id: string) {
  const session = await requireSession();
  await db.notification.updateMany({ where: { id, userId: session.user.id }, data: { read: true } });
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  await db.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}
