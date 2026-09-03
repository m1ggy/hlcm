"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const ADMIN_ONLY = ["ADMIN"] as const;

const nameSchema = z.object({ name: z.string().min(1, "Name is required") });

/** All client groups, with how many clients currently belong to each —
 * used both by the admin manager page and by the client edit form's
 * "Group" select. Same read gate as listClients itself. */
export async function listClientGroups() {
  await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  return prisma.clientGroup.findMany({
    include: { _count: { select: { clients: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createClientGroup(input: { name: string }) {
  const session = await requireRole([...ADMIN_ONLY]);
  const parsed = nameSchema.parse(input);

  const group = await prisma.clientGroup.create({ data: { name: parsed.name, createdById: session.user.id } });

  await recordAudit({ entityType: "ClientGroup", entityId: group.id, action: "create", actorId: session.user.id });

  revalidatePath("/admin/client-groups");
  revalidatePath("/invoices");
  return group;
}

export async function renameClientGroup(id: string, input: { name: string }) {
  const session = await requireRole([...ADMIN_ONLY]);
  const parsed = nameSchema.parse(input);

  const before = await prisma.clientGroup.findUniqueOrThrow({ where: { id } });
  const group = await prisma.clientGroup.update({ where: { id }, data: { name: parsed.name } });

  await recordAudit({
    entityType: "ClientGroup",
    entityId: id,
    action: "rename",
    actorId: session.user.id,
    oldValue: before.name,
    newValue: parsed.name,
  });

  revalidatePath("/admin/client-groups");
  revalidatePath("/invoices");
  return group;
}

/** Never blocked by (or destructive to) its member clients — Client.clientGroup
 * is onDelete: SetNull, so they just revert to showing individually. */
export async function deleteClientGroup(id: string) {
  const session = await requireRole([...ADMIN_ONLY]);
  const group = await prisma.clientGroup.findUniqueOrThrow({ where: { id } });

  await prisma.clientGroup.delete({ where: { id } });

  await recordAudit({
    entityType: "ClientGroup",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    oldValue: group.name,
  });

  revalidatePath("/admin/client-groups");
  revalidatePath("/invoices");
}
