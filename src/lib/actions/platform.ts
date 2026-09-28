"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, isSuperuser, requireSession } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { PLATFORM_SLUG, orgAppUrl } from "@/lib/tenant-host";
import {
  createOrganization,
  listOrganizations,
  resendOwnerInvites,
  setOrganizationStatus,
  type CreateOrganizationInput,
  type PlatformOrganization,
} from "@/lib/platform";

// The platform console (admin.<ROOT_DOMAIN>): only OWNER/DEVELOPER users of
// the platform organization. Audit rows land in the platform org's own log.

async function requirePlatformAdmin() {
  const session = await requireSession();
  if (session.user.orgSlug !== PLATFORM_SLUG || !isSuperuser(session.user.role)) throw new ForbiddenError();
  return session;
}

export async function listOrganizationsForPlatform(): Promise<(PlatformOrganization & { url: string })[]> {
  await requirePlatformAdmin();
  return (await listOrganizations()).map((org) => ({ ...org, url: orgAppUrl(org.slug) }));
}

export async function createOrganizationFromPlatform(input: CreateOrganizationInput): Promise<ActionResult<{ slug: string; inviteSent: boolean }>> {
  return toActionResult(async () => {
    const session = await requirePlatformAdmin();
    const { org, inviteSent } = await createOrganization(input, session.user.name ?? undefined);
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "create", actorId: session.user.id, newValue: `${org.slug}:${org.name}` });
    revalidatePath("/platform");
    return { slug: org.slug, inviteSent };
  });
}

export async function setOrganizationStatusFromPlatform(orgId: string, status: "ACTIVE" | "SUSPENDED"): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requirePlatformAdmin();
    await setOrganizationStatus(orgId, status);
    await recordAudit({ entityType: "Organization", entityId: orgId, action: status === "SUSPENDED" ? "suspend" : "reactivate", actorId: session.user.id });
    revalidatePath("/platform");
  });
}

export async function resendOwnerInvitesFromPlatform(orgId: string): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const session = await requirePlatformAdmin();
    const count = await resendOwnerInvites(orgId, session.user.name ?? undefined);
    await recordAudit({ entityType: "Organization", entityId: orgId, action: "resend_owner_invites", actorId: session.user.id, newValue: String(count) });
    return count;
  });
}
