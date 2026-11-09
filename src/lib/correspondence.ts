import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/user-facing-error";
import { getApplicationAccessLevel, isManagement, type requireSession } from "@/lib/rbac";
import { deleteStoredFile, saveUploadedFile } from "@/lib/storage";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";
import { isEmailFile, mimeFromName, parseEmailFile } from "@/lib/email-import";
import type { $Enums } from "@/generated/prisma/client";

// Correspondence (docs/client-portal-eod-plan.md, Phase B): emails, letters,
// calls and screenshots about an application or a task, newest first, with
// their attachments as ordinary FileAssets (same storage, viewer, limits).
// Same access as the parent: whoever can see the application or task can
// read its correspondence; whoever can edit it can add some; the author and
// management can change or delete an entry. Never for clients or caregivers
// (internal records; what clients see goes through `clientVisible`).
//
// Takes an actor rather than reading the session (tested directly);
// src/lib/actions/correspondence.ts wraps these for the pages.

export type CorrActor = { userId: string; role: string };
export type CorrParent = { applicationId: string } | { taskId: string };

export const CORRESPONDENCE_KINDS = ["EMAIL", "SCREENSHOT", "LETTER", "PHONE_CALL", "PORTAL_MESSAGE", "OTHER"] as const;
export const CORRESPONDENCE_DIRECTIONS = ["INBOUND", "OUTBOUND", "INTERNAL"] as const;
export type CorrKind = (typeof CORRESPONDENCE_KINDS)[number];
export type CorrDirection = (typeof CORRESPONDENCE_DIRECTIONS)[number];

export type CorrInput = {
  kind: CorrKind;
  direction: CorrDirection;
  subject?: string | null;
  fromParty?: string | null;
  toParty?: string | null;
  occurredAt?: Date | null;
  body?: string | null;
  clientVisible?: boolean;
};

const MAX_FILES = 20;
const clean = (v: string | null | undefined) => v?.trim() || null;

export const CORRESPONDENCE_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  task: { select: { id: true, label: true } },
  attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true }, orderBy: { createdAt: "asc" as const } },
};

type Level = "view" | "edit";
type Resolved = { applicationId: string | null; taskId: string | null; clientId: string | null; clientServiceId: string | null };

const asSession = (actor: CorrActor) => ({ user: { id: actor.userId, role: actor.role } }) as unknown as Awaited<ReturnType<typeof requireSession>>;

async function assertApplication(actor: CorrActor, applicationId: string, level: Level) {
  const access = await getApplicationAccessLevel(asSession(actor), applicationId);
  if (access === "none" || (level === "edit" && access !== "edit")) throw new UserFacingError("Not found");
}

/**
 * The parent's ids (a task's application and client come along) once the
 * actor is allowed `level` on it. Same rule as task files: a case's task by
 * the case's access; a standalone task by assignee, creator or management.
 */
async function resolveParent(actor: CorrActor, parent: CorrParent, level: Level): Promise<Resolved> {
  if (actor.role === "CLIENT" || actor.role === "CAREGIVER") throw new UserFacingError("Not found");
  if ("applicationId" in parent) {
    const app = await db.application.findUnique({ where: { id: parent.applicationId }, select: { id: true, clientId: true } });
    if (!app) throw new UserFacingError("Not found");
    await assertApplication(actor, app.id, level);
    return { applicationId: app.id, taskId: null, clientId: app.clientId, clientServiceId: null };
  }
  const task = await db.task.findUnique({
    where: { id: parent.taskId },
    select: {
      id: true,
      applicationId: true,
      createdById: true,
      clientServiceId: true,
      application: { select: { clientId: true } },
      clientService: { select: { clientId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!task) throw new UserFacingError("Not found");
  if (task.applicationId) await assertApplication(actor, task.applicationId, level);
  else if (!isManagement(actor.role) && task.createdById !== actor.userId && !task.assignees.some((a) => a.userId === actor.userId)) {
    throw new UserFacingError("Not found");
  }
  return {
    applicationId: task.applicationId,
    taskId: task.id,
    clientId: task.application?.clientId ?? task.clientService?.clientId ?? null,
    clientServiceId: task.clientServiceId,
  };
}

const parentOf = (row: { applicationId: string | null; taskId: string | null }): CorrParent =>
  row.taskId ? { taskId: row.taskId } : { applicationId: row.applicationId! };

const auditTarget = (r: Resolved) => (r.taskId ? { entityType: "Task", entityId: r.taskId } : { entityType: "Application", entityId: r.applicationId! });

function checkFiles(files: File[]) {
  if (files.length > MAX_FILES) throw new UserFacingError(`Attach at most ${MAX_FILES} files at a time`);
  for (const f of files) if (f.size > MAX_FILE_BYTES) throw new UserFacingError(fileTooLargeMessage(f.name));
}

function checkInput(input: CorrInput) {
  if (!CORRESPONDENCE_KINDS.includes(input.kind)) throw new UserFacingError("Pick what kind of correspondence this is");
  if (!CORRESPONDENCE_DIRECTIONS.includes(input.direction)) throw new UserFacingError("Pick a direction");
  if (input.occurredAt && Number.isNaN(input.occurredAt.getTime())) throw new UserFacingError("That date isn't valid");
}

async function storeAttachments(entry: { id: string; applicationId: string | null; taskId: string | null }, files: File[], userId: string) {
  for (const file of files) {
    const { storageKey, sizeBytes, generation } = await saveUploadedFile(file);
    const mimeType = file.type || mimeFromName(file.name);
    await db.fileAsset.create({
      data: {
        correspondenceId: entry.id,
        // The parent too, so downloads keep its access check (file pools skip these).
        ...(entry.taskId ? { taskId: entry.taskId } : { applicationId: entry.applicationId }),
        fileName: file.name,
        storageKey,
        mimeType,
        sizeBytes,
        uploadedById: userId,
        versions: { create: { version: 1, generation, fileName: file.name, mimeType, sizeBytes, uploadedById: userId } },
      },
    });
  }
}

/** Reads an uploaded .eml/.msg to pre-fill the form; nothing is stored. */
export async function previewEmail(file: File) {
  if (!isEmailFile(file.name)) throw new UserFacingError("That isn't an email file (.eml or .msg)");
  checkFiles([file]);
  const mail = await parseEmailFile(file.name, Buffer.from(await file.arrayBuffer())).catch(() => {
    throw new UserFacingError(`Couldn't read "${file.name}" as an email`);
  });
  return {
    subject: mail.subject,
    fromParty: mail.from,
    toParty: mail.to,
    occurredAt: mail.date,
    body: mail.body,
    attachmentNames: mail.attachments.map((a) => a.fileName),
  };
}

/**
 * Adds an entry. `emailFile` (an .eml/.msg) fills whatever the form left
 * empty, its attachments are kept, and so is the email file itself.
 */
export async function createCorrespondence(actor: CorrActor, parent: CorrParent, input: CorrInput, files: File[] = [], emailFile?: File | null) {
  checkInput(input);
  const where = await resolveParent(actor, parent, "edit");
  const all = [...files];
  let fromEmail: Awaited<ReturnType<typeof parseEmailFile>> | null = null;
  if (emailFile) {
    if (!isEmailFile(emailFile.name)) throw new UserFacingError("That isn't an email file (.eml or .msg)");
    checkFiles([emailFile]);
    fromEmail = await parseEmailFile(emailFile.name, Buffer.from(await emailFile.arrayBuffer())).catch(() => {
      throw new UserFacingError(`Couldn't read "${emailFile.name}" as an email`);
    });
    all.push(emailFile, ...fromEmail.attachments.map((a) => new File([new Uint8Array(a.content)], a.fileName, { type: a.mimeType })));
  }
  checkFiles(all);

  const subject = clean(input.subject) ?? fromEmail?.subject ?? (files.length ? files[0].name : null);
  if (!subject) throw new UserFacingError("Give it a subject");
  const entry = await db.correspondence.create({
    data: {
      ...where,
      kind: input.kind,
      direction: input.direction,
      subject: subject.slice(0, 500),
      fromParty: clean(input.fromParty) ?? fromEmail?.from ?? null,
      toParty: clean(input.toParty) ?? fromEmail?.to ?? null,
      occurredAt: input.occurredAt ?? fromEmail?.date ?? new Date(),
      body: clean(input.body) ?? fromEmail?.body ?? null,
      clientVisible: Boolean(input.clientVisible),
      createdById: actor.userId,
    },
  });
  try {
    await storeAttachments(entry, all, actor.userId);
  } catch (error) {
    // A virus hit or a storage failure: don't leave half an entry behind.
    await deleteCorrespondenceRow(entry.id);
    throw error;
  }
  await recordAudit({ ...auditTarget(where), action: "add_correspondence", actorId: actor.userId, field: "correspondence", newValue: entry.subject });
  return getEntry(entry.id);
}

async function getEntry(id: string) {
  const entry = await db.correspondence.findUnique({ where: { id }, include: CORRESPONDENCE_INCLUDE });
  if (!entry) throw new UserFacingError("That entry is gone — someone may have just deleted it");
  return entry;
}

export type CorrespondenceFull = Awaited<ReturnType<typeof getEntry>>;

/** An entry the actor may change: its author, or management — with edit access to the parent. */
async function editable(actor: CorrActor, id: string) {
  const entry = await getEntry(id);
  const where = await resolveParent(actor, parentOf(entry), "edit");
  if (entry.createdById !== actor.userId && !isManagement(actor.role)) throw new UserFacingError("Only whoever added it or a manager can change this");
  return { entry, where };
}

export async function listCorrespondence(actor: CorrActor, parent: CorrParent) {
  const where = await resolveParent(actor, parent, "view");
  return db.correspondence.findMany({
    where: where.taskId ? { taskId: where.taskId } : { applicationId: where.applicationId },
    include: CORRESPONDENCE_INCLUDE,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateCorrespondence(actor: CorrActor, id: string, input: CorrInput, addFiles: File[] = []) {
  checkInput(input);
  checkFiles(addFiles);
  const { entry, where } = await editable(actor, id);
  const subject = clean(input.subject);
  if (!subject) throw new UserFacingError("Give it a subject");
  await db.correspondence.update({
    where: { id },
    data: {
      kind: input.kind,
      direction: input.direction,
      subject: subject.slice(0, 500),
      fromParty: clean(input.fromParty),
      toParty: clean(input.toParty),
      occurredAt: input.occurredAt ?? entry.occurredAt,
      body: clean(input.body),
      clientVisible: Boolean(input.clientVisible),
    },
  });
  if (addFiles.length) await storeAttachments(entry, addFiles, actor.userId);
  await recordAudit({
    ...auditTarget(where),
    action: "edit_correspondence",
    actorId: actor.userId,
    field: "correspondence",
    oldValue: entry.subject,
    newValue: subject,
  });
  return getEntry(id);
}

export async function removeAttachment(actor: CorrActor, id: string, fileId: string) {
  const { entry, where } = await editable(actor, id);
  const file = await db.fileAsset.findFirst({ where: { id: fileId, correspondenceId: id } });
  if (!file) throw new UserFacingError("That attachment is already gone");
  await db.fileAsset.delete({ where: { id: file.id } });
  await deleteStoredFile(file.storageKey);
  await recordAudit({ ...auditTarget(where), action: "remove_correspondence_file", actorId: actor.userId, field: entry.subject, oldValue: file.fileName });
  return getEntry(id);
}

async function deleteCorrespondenceRow(id: string) {
  const files = await db.fileAsset.findMany({ where: { correspondenceId: id }, select: { storageKey: true } });
  await db.correspondence.delete({ where: { id } }); // attachments cascade
  for (const f of files) await deleteStoredFile(f.storageKey);
}

export async function deleteCorrespondence(actor: CorrActor, id: string) {
  const { entry, where } = await editable(actor, id);
  await deleteCorrespondenceRow(id);
  await recordAudit({ ...auditTarget(where), action: "delete_correspondence", actorId: actor.userId, field: "correspondence", oldValue: entry.subject });
  return { applicationId: entry.applicationId, taskId: entry.taskId };
}

/** How far back an EOD line's "Link correspondence" picker looks. */
export const LINKABLE_DAYS = 30;

/**
 * What an EOD line on these tasks can point at: entries on the tasks or on
 * their applications from the last LINKABLE_DAYS days, newest first.
 */
export async function listLinkableCorrespondence(actor: CorrActor, taskIds: string[], now = new Date()) {
  if (taskIds.length === 0 || actor.role === "CLIENT" || actor.role === "CAREGIVER") return [];
  const since = new Date(now.getTime() - LINKABLE_DAYS * 86_400_000);
  // A case's task counts only when the actor can see the case (same as reading its timeline).
  const visibleApp = isManagement(actor.role)
    ? {}
    : { OR: [{ applicationId: null }, { application: { OR: [{ assignedUserId: actor.userId }, { accessGrants: { some: { userId: actor.userId } } }] } }] };
  const tasks = await db.task.findMany({ where: { id: { in: taskIds }, ...visibleApp }, select: { id: true, applicationId: true } });
  const appIds = [...new Set(tasks.map((t) => t.applicationId).filter((a): a is string => Boolean(a)))];
  const rows = await db.correspondence.findMany({
    where: { occurredAt: { gte: since }, OR: [{ taskId: { in: taskIds } }, ...(appIds.length ? [{ applicationId: { in: appIds } }] : [])] },
    select: { id: true, subject: true, kind: true, occurredAt: true, taskId: true, applicationId: true },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
  // Keyed by task: a task's own entries plus its application's.
  return tasks.flatMap((t) =>
    rows
      .filter((r) => r.taskId === t.id || (t.applicationId && r.applicationId === t.applicationId))
      .map((r) => ({ taskId: t.id, id: r.id, subject: r.subject, kind: r.kind as $Enums.CorrespondenceKind, occurredAt: r.occurredAt }))
  );
}
