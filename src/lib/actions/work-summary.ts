"use server";

import { revalidatePath } from "next/cache";
import { currentOrganization } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { updateWorkSummarySettings } from "@/lib/tenant";
import { UserFacingError } from "@/lib/user-facing-error";
import { workScope } from "@/lib/work";
import type { WorkActor } from "@/lib/work-service";
import { regenerateSummaryNote, saveSummaryNote, setDayTextSkip } from "@/lib/work-summary-notes";

// The client weekly summary's notes and settings (docs/workspace-tasks-plan.md, Phase 3).

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function context() {
  const session = await requireSession();
  const org = await currentOrganization();
  const viewer = { userId: session.user.id, role: session.user.role, isAssigned: Boolean(session.user.isAssigned), orgKind: org.kind };
  const actor: WorkActor = { userId: viewer.userId, scope: workScope(viewer), orgKind: org.kind };
  return { actor, org };
}

function checkDay(day: string) {
  if (!DAY.test(day)) throw new UserFacingError("Pick a valid date");
}

export async function saveSummaryNoteAction(period: "DAY" | "WEEK", day: string, body: string) {
  return toActionResult(async () => {
    checkDay(day);
    const { actor } = await context();
    await saveSummaryNote(actor, period, day, body);
    revalidatePath("/work/summary");
  });
}

export async function regenerateSummaryNoteAction(period: "DAY" | "WEEK", day: string) {
  return toActionResult(async () => {
    checkDay(day);
    const { actor, org } = await context();
    const text = await regenerateSummaryNote(actor, org, period, day);
    revalidatePath("/work/summary");
    return { text };
  });
}

/** Turn one day's evening text off (or back on) before it goes out. */
export async function setDayTextSkipAction(day: string, skip: boolean) {
  return toActionResult(async () => {
    checkDay(day);
    const { actor } = await context();
    await setDayTextSkip(actor, day, skip);
    revalidatePath("/work/summary");
  });
}

/** Show hours to the client, AI summaries, Monday email, evening text. Team managers only (decided W7). */
export async function updateSummarySettingsAction(input: { showHoursToClient?: boolean; aiSummaries?: boolean; weeklyEmail?: boolean; dailyText?: boolean }) {
  return toActionResult(async () => {
    const { actor, org } = await context();
    if (!actor.scope.canManageProjects) throw new UserFacingError("Only the team's managers can change these settings");
    const data = {
      ...(input.showHoursToClient !== undefined && { workShowHoursToClient: input.showHoursToClient }),
      ...(input.aiSummaries !== undefined && { workAiSummaries: input.aiSummaries }),
      ...(input.weeklyEmail !== undefined && { workWeeklyEmail: input.weeklyEmail }),
      ...(input.dailyText !== undefined && { workDailyText: input.dailyText }),
    };
    await updateWorkSummarySettings(org.id, data);
    for (const [field, value] of Object.entries(data)) {
      await recordAudit({ entityType: "Organization", entityId: org.id, action: "update", actorId: actor.userId, field, oldValue: org[field as keyof typeof data], newValue: value });
    }
    revalidatePath("/work/summary");
  });
}
