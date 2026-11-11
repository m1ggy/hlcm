"use server";

import { revalidatePath } from "next/cache";
import { db, currentOrganization } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";
import { UserFacingError } from "@/lib/user-facing-error";
import { workScope, type WorkTaskStatus } from "@/lib/work";
import { getTaskDetail } from "@/lib/work-data";
import * as work from "@/lib/work-service";
import { startTaskTimer } from "@/lib/actions/task-time-entries";
import { linkedWorkTaskUpdateDefaults, postLinkedWorkTaskUpdate, postWorkTaskUpdate, workTaskUpdateDefaults, type TaskUpdateInput } from "@/lib/task-updates";

// Server actions for projects and tasks (docs/workspace-tasks-plan.md,
// Phase 2). The rules live in src/lib/work-service.ts; these build the actor
// from the session and the workspace, send notifications, and refresh /work.

async function actor(): Promise<work.WorkActor> {
  const session = await requireSession();
  const org = await currentOrganization();
  const viewer = { userId: session.user.id, role: session.user.role, isAssigned: Boolean(session.user.isAssigned), orgKind: org.kind };
  return { userId: viewer.userId, scope: workScope(viewer), orgKind: org.kind };
}

async function send(notifications: work.WorkNotification[], actorId: string) {
  for (const n of notifications) await notify(n, actorId);
}

function refresh() {
  revalidatePath("/work", "layout");
}

export async function createProjectAction(input: work.ProjectInput) {
  return toActionResult(async () => {
    const project = await work.createProject(await actor(), input);
    refresh();
    return { id: project.id };
  });
}

export async function updateProjectAction(projectId: string, input: Partial<work.ProjectInput>) {
  return toActionResult(async () => {
    await work.updateProject(await actor(), projectId, input);
    refresh();
  });
}

export async function createTaskAction(input: work.TaskInput) {
  return toActionResult(async () => {
    const a = await actor();
    const { task, notifications } = await work.createTask(a, input);
    await send(notifications, a.userId);
    refresh();
    return { id: task.id };
  });
}

export async function updateTaskAction(taskId: string, patch: work.TaskPatch) {
  return toActionResult(async () => {
    await work.updateTask(await actor(), taskId, patch);
    refresh();
  });
}

export async function moveTaskAction(taskId: string, status: WorkTaskStatus, orderedIds: string[]) {
  return toActionResult(async () => {
    await work.moveTask(await actor(), taskId, status, orderedIds);
    refresh();
  });
}

export async function setAssigneesAction(taskId: string, userIds: string[]) {
  return toActionResult(async () => {
    const a = await actor();
    const { notifications } = await work.setAssignees(a, taskId, userIds);
    await send(notifications, a.userId);
    refresh();
  });
}

export async function deleteTaskAction(taskId: string) {
  return toActionResult(async () => {
    const a = await actor();
    const files = await db.fileAsset.findMany({ where: { OR: [{ workTaskId: taskId }, { workTask: { parentId: taskId } }] }, select: { storageKey: true } });
    await work.deleteTask(a, taskId);
    for (const f of files) await deleteStoredFile(f.storageKey);
    refresh();
  });
}

export async function addCommentAction(taskId: string, input: { body: string; visibility?: "INTERNAL" | "CLIENT" }) {
  return toActionResult(async () => {
    const a = await actor();
    const { notifications } = await work.addComment(a, taskId, input);
    await send(notifications, a.userId);
    refresh();
  });
}

export async function deleteCommentAction(commentId: string) {
  return toActionResult(async () => {
    await work.deleteComment(await actor(), commentId);
    refresh();
  });
}

export async function requestTaskAction(input: work.RequestInput) {
  return toActionResult(async () => {
    const a = await actor();
    const { task, notifications } = await work.requestTask(a, input);
    await send(notifications, a.userId);
    refresh();
    return { id: task.id, projectId: task.projectId };
  });
}

export async function declineRequestAction(taskId: string, reason: string) {
  return toActionResult(async () => {
    const a = await actor();
    const { notifications } = await work.declineRequest(a, taskId, reason);
    await send(notifications, a.userId);
    refresh();
  });
}

// ---- Phase 5: approval queue and templates ----------------------------------

export async function approveRequestAction(taskId: string, assigneeIds: string[] = []) {
  return toActionResult(async () => {
    const a = await actor();
    const { notifications } = await work.approveRequest(a, taskId, { assigneeIds });
    await send(notifications, a.userId);
    refresh();
  });
}

export async function saveTemplateAction(taskId: string) {
  return toActionResult(async () => {
    const template = await work.saveTemplate(await actor(), taskId);
    refresh();
    return { id: template.id, title: template.title };
  });
}

export async function listTemplatesAction(projectId: string) {
  return toActionResult(async () => {
    const a = await actor();
    return (await work.listTemplates(a.scope, projectId)).map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks.length, repeat: t.repeat }));
  });
}

export async function createFromTemplateAction(templateId: string, opts: { dueDate?: string | null } = {}) {
  return toActionResult(async () => {
    const a = await actor();
    const { task, notifications } = await work.createFromTemplate(a, templateId, opts);
    await send(notifications, a.userId);
    refresh();
    return { id: task.id };
  });
}

export async function deleteTemplateAction(templateId: string) {
  return toActionResult(async () => {
    await work.deleteTemplate(await actor(), templateId);
    refresh();
  });
}

/** The task panel's data, filtered for whoever is looking. */
export async function getTaskDetailAction(taskId: string) {
  return toActionResult(async () => {
    const a = await actor();
    const detail = await getTaskDetail(a.scope, taskId);
    if (!detail) throw new UserFacingError("That task doesn't exist or you can't see it");
    return detail;
  });
}

export async function uploadWorkTaskFileAction(taskId: string, formData: FormData) {
  return toActionResult(async () => {
    const a = await actor();
    const task = await work.assertCanAttach(a, taskId);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserFacingError("Choose a file to upload");
    if (file.size > MAX_FILE_BYTES) throw new UserFacingError(fileTooLargeMessage());
    const { storageKey, sizeBytes, generation } = await saveUploadedFile(file);
    const mimeType = file.type || "application/octet-stream";
    const asset = await db.fileAsset.create({
      data: {
        workTaskId: taskId,
        fileName: file.name,
        storageKey,
        mimeType,
        sizeBytes,
        uploadedById: a.userId,
        versions: { create: { version: 1, generation, fileName: file.name, mimeType, sizeBytes, uploadedById: a.userId } },
      },
    });
    await work.recordFileAdded(a, task, file.name);
    await recordAudit({ entityType: "WorkTask", entityId: taskId, action: "upload_file", actorId: a.userId, field: "file", newValue: file.name });
    refresh();
    return { id: asset.id };
  });
}

export async function deleteWorkTaskFileAction(fileId: string) {
  return toActionResult(async () => {
    const a = await actor();
    const asset = await db.fileAsset.findUnique({ where: { id: fileId }, select: { id: true, workTaskId: true, uploadedById: true, storageKey: true, fileName: true } });
    if (!asset?.workTaskId) throw new UserFacingError("That file is already gone");
    await work.assertCanAttach(a, asset.workTaskId);
    if (asset.uploadedById !== a.userId && !a.scope.canManageProjects) throw new UserFacingError("Only a manager or the person who added it can remove a file");
    await db.fileAsset.delete({ where: { id: fileId } });
    await deleteStoredFile(asset.storageKey);
    await recordAudit({ entityType: "WorkTask", entityId: asset.workTaskId, action: "delete_file", actorId: a.userId, field: "file", oldValue: asset.fileName });
    refresh();
  });
}

/** "Start timer" on a project task: the regular task timer, pointed at it. */
export async function startWorkTimerAction(taskId: string) {
  return toActionResult(async () => {
    const entry = await startTaskTimer({ workTaskId: taskId });
    refresh();
    return { clockedIn: entry.clockedIn };
  });
}

// ---- Updates written on a task (docs/task-updates-plan.md) -----------------

/** "What did you do?" on a task here: posts it on the task (finishing it when ticked) and adds it to your end-of-day report. */
export async function postTaskUpdateAction(taskId: string, input: TaskUpdateInput) {
  return toActionResult(async () => {
    const [a, org] = await Promise.all([actor(), currentOrganization()]);
    const r = await postWorkTaskUpdate(a, { id: org.id, name: org.name }, taskId, input);
    refresh();
    revalidatePath("/eod");
    return { addedToReport: r.addedToReport, afterSubmit: r.afterSubmit };
  });
}

export async function taskUpdateDefaultsAction(taskId: string) {
  return toActionResult(async () => {
    const session = await requireSession();
    return workTaskUpdateDefaults(session.user.id, taskId);
  });
}

/** The same from the Client work page, for a task in one of your client workspaces. */
export async function postClientWorkUpdateAction(orgId: string, taskId: string, input: TaskUpdateInput) {
  return toActionResult(async () => {
    const session = await requireSession();
    const r = await postLinkedWorkTaskUpdate(session.user.id, orgId, taskId, input);
    revalidatePath("/client-work");
    revalidatePath("/eod");
    return { addedToReport: r.addedToReport, afterSubmit: r.afterSubmit };
  });
}

export async function clientWorkUpdateDefaultsAction(orgId: string, taskId: string) {
  return toActionResult(async () => {
    const session = await requireSession();
    return linkedWorkTaskUpdateDefaults(session.user.id, orgId, taskId);
  });
}
