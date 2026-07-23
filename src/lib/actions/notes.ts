"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess } from "@/lib/rbac";
import { notify } from "@/lib/notifications";

export async function listNotes(applicationId: string) {
  const session = await requireSession();
  await assertApplicationAccess(session, applicationId, "view");

  return prisma.note.findMany({
    where: { applicationId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

const addNoteSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().min(1, "Comment can't be empty"),
  mentionedUserIds: z.array(z.string()).default([]),
});

export async function addNote(input: z.infer<typeof addNoteSchema>) {
  const parsed = addNoteSchema.parse(input);
  const session = await requireSession();
  await assertApplicationAccess(session, parsed.applicationId, "view");

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: parsed.applicationId },
    select: { name: true },
  });

  const note = await prisma.note.create({
    data: {
      applicationId: parsed.applicationId,
      body: parsed.body,
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  for (const userId of new Set(parsed.mentionedUserIds)) {
    await notify(
      {
        userId,
        type: "MENTIONED",
        message: `${session.user.name} mentioned you in "${application.name}"`,
        entityType: "Application",
        entityId: parsed.applicationId,
      },
      session.user.id
    );
  }

  revalidatePath(`/applications/${parsed.applicationId}`);
  return note;
}
