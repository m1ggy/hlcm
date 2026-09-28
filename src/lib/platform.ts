import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { isValidOrgSlug, PLATFORM_SLUG } from "@/lib/tenant-host";
import { seedOrganization } from "@/lib/org-seed";
import { sendInviteEmail } from "@/lib/auth-emails";
import { UserFacingError } from "@/lib/user-facing-error";

// Operator-side management of tenant workspaces — the only app code that
// works *across* organizations (hence the raw client; see the ESLint
// allowlist). Callers gate on being a platform admin (src/lib/actions/
// platform.ts). Nothing here reads or writes a tenant's business data:
// creating an org hands its setup to seedOrganization() and its first
// owner to the ordinary invite flow, scoped to the new org.

export type PlatformOrganization = {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: Date;
  userCount: number;
};

export async function listOrganizations(): Promise<PlatformOrganization[]> {
  const orgs = await prisma.organization.findMany({
    where: { slug: { not: PLATFORM_SLUG } },
    orderBy: { createdAt: "asc" },
    select: { id: true, slug: true, name: true, status: true, createdAt: true, _count: { select: { users: true } } },
  });
  return orgs.map(({ _count, ...org }) => ({ ...org, userCount: _count.users }));
}

export type CreateOrganizationInput = { name: string; slug: string; ownerName: string; ownerEmail: string };

/**
 * Creates a tenant: the organization, its first OWNER (no usable password —
 * they get an invite), and its starting setup (a copy of the template org's,
 * see seedOrganization). Returns whether the owner's invite email went out.
 */
export async function createOrganization(input: CreateOrganizationInput, invitedBy?: string) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name) throw new UserFacingError("Organization name is required");
  if (!isValidOrgSlug(slug)) {
    throw new UserFacingError("The address must be lowercase letters, numbers and dashes (no leading/trailing dash), and not a reserved word");
  }
  if (!ownerName) throw new UserFacingError("Owner name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new UserFacingError("Enter a valid owner email");
  if (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    throw new UserFacingError(`The address "${slug}" is already taken`);
  }

  const org = await prisma.organization.create({ data: { name, slug }, select: { id: true, slug: true, name: true } });
  const owner = await tenantDb(org.id).user.create({
    data: { name: ownerName, email: ownerEmail, role: "OWNER", passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
    select: { id: true, name: true, email: true },
  });
  await seedOrganization({ org, ownerId: owner.id });

  let inviteSent = true;
  try {
    await runAsTenant({ id: org.id, slug: org.slug }, () => sendInviteEmail(owner, invitedBy));
  } catch (error) {
    console.error(`Failed to send the owner invite for new org ${org.slug}:`, error);
    inviteSent = false;
  }
  return { org, inviteSent };
}

/** Re-sends the invite to every owner of `orgId` who hasn't accepted theirs yet. */
export async function resendOwnerInvites(orgId: string, invitedBy?: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, slug: true } });
  const t = tenantDb(org.id);
  const owners = await t.user.findMany({ where: { role: "OWNER", active: true }, select: { id: true, name: true, email: true } });
  const pending: typeof owners = [];
  for (const owner of owners) {
    const accepted = await t.authToken.count({ where: { userId: owner.id, kind: "INVITE", usedAt: { not: null } } });
    if (accepted === 0) pending.push(owner);
  }
  await runAsTenant(org, async () => {
    for (const owner of pending) await sendInviteEmail(owner, invitedBy);
  });
  return pending.length;
}

export async function setOrganizationStatus(orgId: string, status: "ACTIVE" | "SUSPENDED") {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
  if (org.slug === PLATFORM_SLUG) throw new UserFacingError("The platform organization can't be suspended");
  await prisma.organization.update({ where: { id: orgId }, data: { status } });
  forgetOrg(org.slug);
}

/**
 * The active workspaces where `email` has an active account — for the
 * "find your workspace" email on the bare root domain. Cross-org by nature
 * (that's the question being asked), so it lives here; the caller emails the
 * result rather than showing it, so it can't be used to probe accounts.
 */
export async function findWorkspacesForEmail(email: string): Promise<{ name: string; slug: string }[]> {
  const users = await prisma.user.findMany({
    where: {
      email: { equals: email.trim(), mode: "insensitive" },
      active: true,
      organization: { status: "ACTIVE", slug: { not: PLATFORM_SLUG } },
    },
    select: { organization: { select: { name: true, slug: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  return users.map((u) => u.organization);
}
