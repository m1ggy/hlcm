"use server";

import { currentOrganization, db } from "@/lib/db";
import { requireSession, applicationVisibilityFilter, AppRole, isManagement } from "@/lib/rbac";
import { caregiverClientScope } from "@/lib/caregiver-scope";
import { hasCare } from "@/lib/workspace-kind";
import { canManageCare } from "@/lib/care-access";

export async function searchAll(query: string) {
  const session = await requireSession();
  const role = session.user.role as AppRole;
  const q = query.trim();
  if (!q) return { applications: [], clients: [], tasks: [], careClients: [], caregivers: [] };

  // A tasks-only workspace has no licensing records; a care agency's one
  // (docs/client-care-plan.md) has its clients and caregivers to find.
  const org = await currentOrganization();
  if (org.kind === "TASKS") {
    if (!hasCare(org) || !canManageCare(role)) return { applications: [], clients: [], tasks: [], careClients: [], caregivers: [] };
    const contains = { contains: q, mode: "insensitive" as const };
    const [careClients, caregivers] = await Promise.all([
      db.careRecipient.findMany({ where: { active: true, name: contains }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 10 }),
      db.user.findMany({
        where: { role: "CAREGIVER", active: true, isSupport: false, assignedFromUserId: null, OR: [{ name: contains }, { phone: { contains: q } }] },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 10,
      }),
    ]);
    return { applications: [], clients: [], tasks: [], careClients, caregivers };
  }

  const applications = await db.application.findMany({
    where: {
      AND: [
        applicationVisibilityFilter(session),
        { active: true },
        { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
      ],
    },
    include: { client: true },
    take: 10,
  });

  const clients =
    isManagement(role) || role === "STAFF"
      ? await db.client.findMany({
          where: { name: { contains: q, mode: "insensitive" }, active: true },
          take: 10,
        })
      : role === "CAREGIVER"
        ? await db.client.findMany({
            where: { name: { contains: q, mode: "insensitive" }, active: true, ...caregiverClientScope(session.user.id) },
            take: 10,
          })
        : [];

  const taskWhere =
    isManagement(role)
      ? { label: { contains: q, mode: "insensitive" as const } }
      : {
          label: { contains: q, mode: "insensitive" as const },
          assignees: { some: { userId: session.user.id } },
        };
  const tasks = await db.task.findMany({
    where: taskWhere,
    include: { application: { select: { id: true, name: true } } },
    take: 10,
  });

  return { applications, clients, tasks, careClients: [] as { id: string; name: string }[], caregivers: [] as { id: string; name: string }[] };
}
