"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, applicationVisibilityFilter, AppRole } from "@/lib/rbac";
import { APPLICATION_STATUSES } from "@/lib/status";

export async function getDashboardStats() {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  const isManagement = role === "ADMIN" || role === "MANAGER";
  const appFilter = applicationVisibilityFilter(session);

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
    status: { notIn: ["COMPLETED" as const, "NA" as const] },
    ...(isManagement ? {} : { assignedUserId: session.user.id }),
  };
  const overdueTasks = await prisma.task.findMany({
    where: overdueWhere,
    include: {
      assignedUser: { select: { name: true } },
      application: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  let workload: { userId: string; name: string; count: number }[] = [];
  if (isManagement) {
    const grouped = await prisma.task.groupBy({
      by: ["assignedUserId"],
      where: { status: { notIn: ["COMPLETED", "NA"] } },
      _count: { assignedUserId: true },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.assignedUserId) } },
      select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
    workload = grouped
      .map((g) => ({ userId: g.assignedUserId, name: nameById[g.assignedUserId] ?? "Unknown", count: g._count.assignedUserId }))
      .sort((a, b) => b.count - a.count);
  }

  return { applicationsByStatus, overdueTasks, workload, isManagement };
}
