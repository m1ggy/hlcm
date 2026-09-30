"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { currentOrganization } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { setSupportAccessUntil } from "@/lib/tenant";
import { SUPPORT_GRANT_HOURS } from "@/lib/support-access";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";

// The workspace side of platform support access (src/lib/support-access.ts):
// the owner switches it on for a while or off again, and the one-time link
// from the console signs support in.

/** /support/enter's button: trades the one-time link for a support session. */
export async function enterAsSupport(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await signIn("credentials", { supportToken: token, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/support/enter?error=1");
    throw error;
  }
}

async function requireOwner() {
  const session = await requireRole(["OWNER"]);
  if (session.user.isSupport) throw new UserFacingError("Only the workspace's owner can change support access");
  return session;
}

export async function grantSupportAccess(hours: number): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireOwner();
    if (!(SUPPORT_GRANT_HOURS as readonly number[]).includes(hours)) throw new UserFacingError("Pick how long support may have access");
    const org = await currentOrganization();
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    await setSupportAccessUntil(org.id, until);
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "support_access_granted", actorId: session.user.id, newValue: until.toISOString() });
    revalidatePath("/admin/organization");
  });
}

export async function revokeSupportAccess(): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireOwner();
    const org = await currentOrganization();
    await setSupportAccessUntil(org.id, null);
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "support_access_revoked", actorId: session.user.id });
    revalidatePath("/admin/organization");
  });
}
