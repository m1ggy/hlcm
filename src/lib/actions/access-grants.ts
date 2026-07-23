"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

const GRANT_PERMISSIONS = ["VIEW", "EDIT"] as const;

export async function listAccessGrants(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  return prisma.accessGrant.findMany({
    where: { applicationId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// Anyone who could be granted access — active, not already granted, and not
// the current owner (owners already have full edit access implicitly).
export async function listGrantableUsers(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const [app, existingGrants] = await Promise.all([
    prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { assignedUserId: true } }),
    prisma.accessGrant.findMany({ where: { applicationId }, select: { userId: true } }),
  ]);
  const excluded = new Set([app.assignedUserId, ...existingGrants.map((g) => g.userId)]);

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return users.filter((u) => !excluded.has(u.id));
}

const addGrantSchema = z.object({
  userId: z.string().min(1),
  permission: z.enum(GRANT_PERMISSIONS),
});

export async function addAccessGrant(applicationId: string, formData: FormData) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  const parsed = addGrantSchema.parse({
    userId: formData.get("userId"),
    permission: formData.get("permission") || "VIEW",
  });

  const grant = await prisma.accessGrant.create({
    data: {
      applicationId,
      userId: parsed.userId,
      permission: parsed.permission,
      grantedById: session.user.id,
    },
  });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "share",
    actorId: session.user.id,
    field: "accessGrant",
    newValue: `${parsed.userId}:${parsed.permission}`,
  });

  const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId }, select: { name: true } });
  await notify(
    {
      userId: parsed.userId,
      type: "APPLICATION_SHARED",
      message: `You were given ${parsed.permission.toLowerCase()} access to "${application.name}"`,
      entityType: "Application",
      entityId: applicationId,
    },
    session.user.id
  );

  revalidatePath(`/applications/${applicationId}`);
  return grant;
}

export async function updateAccessGrant(grantId: string, applicationId: string, permission: "VIEW" | "EDIT") {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  await prisma.accessGrant.update({ where: { id: grantId }, data: { permission } });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "update_share",
    actorId: session.user.id,
    field: "accessGrant",
    newValue: `${grantId}:${permission}`,
  });

  revalidatePath(`/applications/${applicationId}`);
}

export async function removeAccessGrant(grantId: string, applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "edit");

  await prisma.accessGrant.delete({ where: { id: grantId } });

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "unshare",
    actorId: session.user.id,
    field: "accessGrant",
    oldValue: grantId,
  });

  revalidatePath(`/applications/${applicationId}`);
}
