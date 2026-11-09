"use server";

import { revalidatePath } from "next/cache";
import { isManagement, requireSession } from "@/lib/rbac";
import { getMyWorkingTimezone } from "@/lib/actions/account";
import { toActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import * as corr from "@/lib/correspondence";
import { toCorrespondenceRow } from "@/lib/correspondence-view";

// Correspondence (docs/client-portal-eod-plan.md, Phase B): the session
// around src/lib/correspondence.ts, plus page refreshes. The forms post
// FormData (files, a pasted screenshot, an .eml/.msg).

async function actor(): Promise<corr.CorrActor> {
  const session = await requireSession();
  return { userId: session.user.id, role: session.user.role };
}

function refresh(where: { applicationId: string | null; taskId: string | null }) {
  if (where.applicationId) revalidatePath(`/applications/${where.applicationId}`);
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
};
const files = (form: FormData, key: string) => form.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);

function readInput(form: FormData): corr.CorrInput {
  const when = text(form, "occurredAt");
  return {
    kind: (text(form, "kind") ?? "EMAIL") as corr.CorrKind,
    direction: (text(form, "direction") ?? "INBOUND") as corr.CorrDirection,
    subject: text(form, "subject"),
    fromParty: text(form, "fromParty"),
    toParty: text(form, "toParty"),
    // The browser sends an ISO instant (its local time converted).
    occurredAt: when ? new Date(when) : null,
    body: text(form, "body"),
    clientVisible: text(form, "clientVisible") === "true",
  };
}

function readParent(form: FormData): corr.CorrParent {
  const applicationId = text(form, "applicationId");
  const taskId = text(form, "taskId");
  if (taskId) return { taskId };
  if (applicationId) return { applicationId };
  throw new UserFacingError("Nothing to attach this to");
}

/** The timeline, plus who's asking (so the task dialog knows which entries they may change). */
export async function listCorrespondenceAction(parent: corr.CorrParent) {
  return toActionResult(async () => {
    const me = await actor();
    const rows = (await corr.listCorrespondence(me, parent)).map(toCorrespondenceRow);
    return { rows, me: { userId: me.userId, canManage: isManagement(me.role), timeZone: await getMyWorkingTimezone() } };
  });
}

export async function previewEmailAction(form: FormData) {
  return toActionResult(async () => {
    await actor();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserFacingError("Choose an email file");
    return corr.previewEmail(file);
  });
}

export async function createCorrespondenceAction(form: FormData) {
  return toActionResult(async () => {
    const email = form.get("emailFile");
    const entry = await corr.createCorrespondence(
      await actor(),
      readParent(form),
      readInput(form),
      files(form, "files"),
      email instanceof File && email.size > 0 ? email : null
    );
    refresh(entry);
    return toCorrespondenceRow(entry);
  });
}

export async function updateCorrespondenceAction(id: string, form: FormData) {
  return toActionResult(async () => {
    const entry = await corr.updateCorrespondence(await actor(), id, readInput(form), files(form, "files"));
    refresh(entry);
    return toCorrespondenceRow(entry);
  });
}

export async function removeCorrespondenceFileAction(id: string, fileId: string) {
  return toActionResult(async () => {
    const entry = await corr.removeAttachment(await actor(), id, fileId);
    refresh(entry);
    return toCorrespondenceRow(entry);
  });
}

export async function deleteCorrespondenceAction(id: string) {
  return toActionResult(async () => {
    refresh(await corr.deleteCorrespondence(await actor(), id));
  });
}
