"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, applicationVisibilityFilter, AppRole } from "@/lib/rbac";
import { APPLICATION_STATUSES } from "@/lib/status";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";

export async function getDashboardStats() {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  const isManagement = role === "ADMIN" || role === "MANAGER";
  const appFilter = { ...applicationVisibilityFilter(session), active: true };

  const statusCounts = await prisma.application.groupBy({
    by: ["status"],
    where: appFilter,
    _count: { status: true },
  });
  const applicationsByStatus = APPLICATION_STATUSES.map((status) => ({
    status,
    count: statusCounts.find((s) => s.status === status)?._count.status ?? 0,
  }));

  const overdueWhere = {
    dueDate: { lt: new Date() },
    status: { notIn: [...TASK_CLOSED_STATUSES] },
    OR: [{ applicationId: null }, { application: { active: true } }],
    ...(isManagement ? {} : { assignees: { some: { userId: session.user.id } } }),
  };
  const overdueTasks = await prisma.task.findMany({
    where: overdueWhere,
    include: {
      assignees: { include: { user: { select: { name: true } } } },
      application: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  // Prisma's groupBy can't group by an m2m relation (assignees), so the
  // workload count is tallied in JS instead — a task with 2 assignees
  // counts toward both people's totals.
  let workload: { userId: string; name: string; count: number }[] = [];
  if (isManagement) {
    const tasks = await prisma.task.findMany({
      where: { status: { notIn: [...TASK_CLOSED_STATUSES] } },
      select: { assignees: { select: { userId: true } } },
    });
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const a of task.assignees) {
        counts.set(a.userId, (counts.get(a.userId) ?? 0) + 1);
      }
    }
    const users = await prisma.user.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
    workload = [...counts.entries()]
      .map(([userId, count]) => ({ userId, name: nameById[userId] ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count);
  }

  return { applicationsByStatus, overdueTasks, workload, isManagement };
}
