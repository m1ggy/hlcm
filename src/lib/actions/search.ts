"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, applicationVisibilityFilter, AppRole } from "@/lib/rbac";

export async function searchAll(query: string) {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  const q = query.trim();
  if (!q) return { applications: [], clients: [], tasks: [] };

  const applications = await prisma.application.findMany({
    where: {
      AND: [
        applicationVisibilityFilter(session),
        { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
      ],
    },
    include: { client: true },
    take: 10,
  });

  const clients =
    role === "ADMIN" || role === "MANAGER" || role === "STAFF"
      ? await prisma.client.findMany({
          where: { name: { contains: q, mode: "insensitive" } },
          take: 10,
        })
      : [];

  const taskWhere =
    role === "ADMIN" || role === "MANAGER"
      ? { label: { contains: q, mode: "insensitive" as const } }
      : { label: { contains: q, mode: "insensitive" as const }, assignedUserId: session.user.id };
  const tasks = await prisma.task.findMany({
    where: taskWhere,
    include: { application: { select: { id: true, name: true } } },
    take: 10,
  });

  return { applications, clients, tasks };
}
