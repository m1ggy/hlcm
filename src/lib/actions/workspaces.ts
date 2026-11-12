"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getHostOrg } from "@/lib/tenant";
import { homePathFor } from "@/lib/workspace-kind";
import { requireSession } from "@/lib/rbac";
import { toActionResult } from "@/lib/action-result";
import { safeSwitchPath, startWorkspaceSwitch } from "@/lib/workspace-switch";
import {
  assignToWorkspace,
  endAssignment,
  saveClientTextSignup,
  type AssignableRole,
  type AssignmentActor,
  type ClientTextInput,
} from "@/lib/workspace-assignments";

// Switching workspaces and assigning a managing company's people to client
// workspaces (docs/workspace-tasks-plan.md, Phase 1). The rules live in
// src/lib/workspace-switch.ts and src/lib/workspace-assignments.ts.

async function actor(): Promise<AssignmentActor> {
  const session = await requireSession();
  return { userId: session.user.id, orgId: session.user.organizationId, role: session.user.role, name: session.user.name };
}

/** The switcher: a one-time link into `slug` for the browser to open. */
export async function switchWorkspace(slug: string, next?: string) {
  return toActionResult(async () => {
    const session = await requireSession();
    return { url: await startWorkspaceSwitch({ id: session.user.id, organizationId: session.user.organizationId }, slug, next) };
  });
}

/** /switch/enter: trades the one-time link for a session in this workspace. */
export async function enterSwitchedWorkspace(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const next = safeSwitchPath(String(formData.get("next") ?? "")) ?? homePathFor((await getHostOrg())?.kind);
  try {
    await signIn("credentials", { switchToken: token, redirectTo: next });
  } catch (error) {
    if (error instanceof AuthError) redirect("/switch/enter?error=1");
    throw error;
  }
}

export async function assignStaff(input: { orgId: string; homeUserId: string; role: AssignableRole; canAssign: boolean }) {
  return toActionResult(async () => {
    await assignToWorkspace(await actor(), input);
    revalidatePath("/client-workspaces");
  });
}

/** A client person's mobile number and evening-text sign-up, from Client workspaces. */
export async function saveClientText(input: ClientTextInput) {
  return toActionResult(async () => {
    await saveClientTextSignup(await actor(), input);
    revalidatePath("/client-workspaces");
  });
}

export async function removeAssignment(assignmentId: string) {
  return toActionResult(async () => {
    await endAssignment(await actor(), assignmentId);
    revalidatePath("/client-workspaces");
  });
}
