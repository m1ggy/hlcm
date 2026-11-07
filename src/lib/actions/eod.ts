"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { eodActor } from "@/lib/eod-session";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { notify } from "@/lib/notifications";
import { UserFacingError } from "@/lib/user-facing-error";
import * as eod from "@/lib/eod";

// End-of-day reports (docs/client-portal-eod-plan.md, Phase C): the session
// and timezone around src/lib/eod.ts, plus notifications and page refreshes.

async function send(notifications: eod.EodNotification[], actorId: string) {
  for (const n of notifications) await notify(n, actorId);
}

function refresh(reportId?: string) {
  revalidatePath("/eod");
  revalidatePath("/eod/team");
  if (reportId) revalidatePath(`/eod/r/${reportId}`);
}

export async function startDayAction() {
  return toActionResult(async () => {
    const report = await eod.startDay(await eodActor());
    refresh(report.id);
    return { id: report.id };
  });
}

export async function saveEodDraftAction(reportId: string, input: eod.EodDraftInput) {
  return toActionResult(async () => {
    const report = await eod.saveDraft(await eodActor(), reportId, input);
    return { items: report.items.map((i) => ({ id: i.id, taskId: i.taskId, clientId: i.clientId, statusBefore: i.statusBefore })) };
  });
}

export async function submitEodAction(reportId: string) {
  return toActionResult(async () => {
    const actor = await eodActor();
    const { notifications } = await eod.submitReport(actor, reportId);
    await send(notifications, actor.userId);
    refresh(reportId);
    revalidatePath("/tasks");
  });
}

export async function reopenEodAction(reportId: string) {
  return toActionResult(async () => {
    await eod.reopenReport(await eodActor(), reportId);
    refresh(reportId);
  });
}

export async function commentOnEodAction(reportId: string, body: string) {
  return toActionResult(async () => {
    const actor = await eodActor();
    await send(await eod.addReportComment(actor, reportId, body), actor.userId);
    refresh(reportId);
  });
}

/** Admin → Users: whether someone is expected to submit (null = the role default). */
export async function setEodRequiredAction(userId: string, required: boolean | null) {
  return toActionResult(async () => {
    const actor = await eodActor();
    if (!eod.canManageEods(actor.role)) throw new UserFacingError("Only managers can change this");
    await db.user.update({ where: { id: userId }, data: { eodRequired: required } });
    revalidatePath("/eod/team");
  });
}

/** Where today's report stands, for the clock-in / clock-out prompts (decided D3). */
export async function myEodStatusToday(): Promise<"NONE" | "DRAFT" | "SUBMITTED" | "NOT_USED"> {
  const session = await requireSession();
  if (!eod.canWriteEod(session.user.role)) return "NOT_USED";
  let actor: eod.EodActor;
  try {
    actor = await eodActor();
  } catch {
    return "NOT_USED";
  }
  const report = await eod.getReportFor(actor.userId, eod.eodToday(actor.timeZone));
  return report ? report.status : "NONE";
}
