"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession, assertApplicationAccess } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { notify } from "@/lib/notifications";

const GRANT_PERMISSIONS = ["VIEW", "EDIT"] as const;

export async function listAccessGrants(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");
  return db.accessGrant.findMany({
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
    db.application.findUniqueOrThrow({ where: { id: applicationId }, select: { assignedUserId: true } }),
    db.accessGrant.findMany({ where: { applicationId }, select: { userId: true } }),
  ]);
  const excluded = new Set([app.assignedUserId, ...existingGrants.map((g) => g.userId)]);

  const users = await db.user.findMany({
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

  const grant = await db.accessGrant
    .create({
      data: {
        applicationId,
        userId: parsed.userId,
        permission: parsed.permission,
        grantedById: session.user.id,
      },
    })
    .catch((e) =>
      friendlyPrismaError(e, { duplicateMessages: { "applicationId,userId": "That person already has access to this case" } })
    );

  await recordAudit({
    entityType: "Application",
    entityId: applicationId,
    action: "share",
    actorId: session.user.id,
    field: "accessGrant",
    newValue: `${parsed.userId}:${parsed.permission}`,
  });

  const application = await db.application.findUniqueOrThrow({ where: { id: applicationId }, select: { name: true } });
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

  await db.accessGrant.update({ where: { id: grantId }, data: { permission } });

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

  await db.accessGrant
    .delete({ where: { id: grantId } })
    .catch((e) => friendlyPrismaError(e, { notFoundMessage: "That access grant is already gone — someone else may have just removed it" }));

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
