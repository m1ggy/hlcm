import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { isValidOrgSlug, PLATFORM_SLUG } from "@/lib/tenant-host";
import { seedOrganization } from "@/lib/org-seed";
import { sendInviteEmail } from "@/lib/auth-emails";
import { UserFacingError } from "@/lib/user-facing-error";
import { assignToWorkspace, setWorkspaceSetup, type AssignableRole } from "@/lib/workspace-assignments";
import { createStarterProject } from "@/lib/work-starter";

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
  clientCount: number;
  applicationCount: number;
  /** Bytes of uploaded files (every stored file version, invoice attachments, form uploads). */
  storageBytes: number;
  /** The newest audit-log entry — someone changed something. */
  lastActivityAt: Date | null;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  /** FULL = licensing CRM; TASKS = a client company's tasks-only workspace. */
  kind: "FULL" | "TASKS";
  /** The managing company whose people work here (docs/workspace-tasks-plan.md). */
  managedByOrgId: string | null;
  managedByName: string | null;
};

type OrgGroup<T> = { organizationId: string } & T;

// Per-org totals for the console. Counts and sums only — never the rows.
function byOrg<T>(rows: OrgGroup<T>[], pick: (row: OrgGroup<T>) => number) {
  return new Map(rows.map((row) => [row.organizationId, pick(row)]));
}

export async function listOrganizations(): Promise<PlatformOrganization[]> {
  const orgs = await prisma.organization.findMany({
    where: { slug: { not: PLATFORM_SLUG } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      createdAt: true,
      termsVersion: true,
      termsAcceptedAt: true,
      kind: true,
      managedByOrgId: true,
      managedBy: { select: { name: true } },
      // A managing company's assigned staff (linked accounts) aren't the workspace's own users.
      _count: { select: { users: { where: { isSupport: false, assignedFromUserId: null, active: true } } } },
    },
  });
  const [clients, applications, versions, attachments, formFiles, activity] = await Promise.all([
    prisma.client.groupBy({ by: ["organizationId"], where: { active: true }, _count: { _all: true } }),
    prisma.application.groupBy({ by: ["organizationId"], where: { active: true }, _count: { _all: true } }),
    prisma.fileVersion.groupBy({ by: ["organizationId"], _sum: { sizeBytes: true } }),
    prisma.invoiceAttachment.groupBy({ by: ["organizationId"], _sum: { sizeBytes: true } }),
    prisma.formSubmissionFile.groupBy({ by: ["organizationId"], _sum: { sizeBytes: true } }),
    prisma.auditLog.groupBy({ by: ["organizationId"], _max: { createdAt: true } }),
  ]);
  const clientCounts = byOrg(clients, (r) => r._count._all);
  const applicationCounts = byOrg(applications, (r) => r._count._all);
  const storage = [versions, attachments, formFiles].map((rows) => byOrg(rows, (r) => r._sum.sizeBytes ?? 0));
  const lastActivity = new Map(activity.map((r) => [r.organizationId, r._max.createdAt]));

  return orgs.map(({ _count, managedBy, ...org }) => ({
    ...org,
    managedByName: managedBy?.name ?? null,
    userCount: _count.users,
    clientCount: clientCounts.get(org.id) ?? 0,
    applicationCount: applicationCounts.get(org.id) ?? 0,
    storageBytes: storage.reduce((sum, m) => sum + (m.get(org.id) ?? 0), 0),
    lastActivityAt: lastActivity.get(org.id) ?? null,
  }));
}

/** A tenant workspace by id (never the platform org), for acting on it from the console. */
export async function getTenantOrganization(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, slug: true, name: true, status: true } });
  if (!org || org.slug === PLATFORM_SLUG) throw new UserFacingError("Workspace not found");
  return org;
}

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  kind?: "FULL" | "TASKS";
  managedByOrgId?: string | null;
  /** The managing company's people to put to work there straight away (needs managedByOrgId). */
  assign?: { homeUserId: string; role: AssignableRole; canAssign: boolean }[];
};

/** The platform admin creating the workspace, for the invite email and the assignment audit entries. */
export type PlatformActor = { id: string; name?: string | null };

/**
 * Creates a tenant: the organization, its first OWNER (no usable password —
 * they get an invite), and its starting setup (a copy of the template org's,
 * see seedOrganization). A tasks-only client workspace gets a "Getting
 * started" project instead of the licensing template, and the managing
 * company's people picked in the wizard. Returns whether the owner's invite
 * email went out, and any assignment that couldn't be made.
 */
export async function createOrganization(input: CreateOrganizationInput, by?: PlatformActor) {
  const invitedBy = by?.name ?? undefined;
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
  const tasksOnly = input.kind === "TASKS";
  // Tasks-only: no licensing setup to copy (only the built-in defaults).
  await seedOrganization({ org, ownerId: owner.id, ...(tasksOnly && { templateOrgSlug: null }) });
  if (tasksOnly || input.managedByOrgId) {
    await setWorkspaceSetup(org.id, { kind: input.kind ?? "FULL", managedByOrgId: input.managedByOrgId || null });
  }
  if (tasksOnly) await runAsTenant({ id: org.id, slug: org.slug }, () => createStarterProject(owner.id));

  // The workspace exists by now, so a failed pick is reported, not thrown.
  const assignErrors: string[] = [];
  if (input.managedByOrgId && by) {
    const actor = { userId: by.id, orgId: input.managedByOrgId, role: "DEVELOPER", name: by.name, viaPlatform: true };
    for (const pick of input.assign ?? []) {
      try {
        await assignToWorkspace(actor, { orgId: org.id, ...pick });
      } catch (error) {
        assignErrors.push(error instanceof UserFacingError ? error.message : "An assignment failed");
        if (!(error instanceof UserFacingError)) console.error(`Failed to assign ${pick.homeUserId} to new org ${org.slug}:`, error);
      }
    }
  }

  let inviteSent = true;
  try {
    await runAsTenant({ id: org.id, slug: org.slug }, () => sendInviteEmail(owner, invitedBy));
  } catch (error) {
    console.error(`Failed to send the owner invite for new org ${org.slug}:`, error);
    inviteSent = false;
  }
  return { org, inviteSent, assignErrors };
}

/** The people a managing company could put to work in a new workspace (the create wizard's "Assign staff" step). */
export async function listStaffOf(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { slug: true, managedByOrgId: true } });
  if (!org || org.slug === PLATFORM_SLUG || org.managedByOrgId) throw new UserFacingError("Pick a workspace as the managing company");
  return prisma.user.findMany({
    where: { organizationId: orgId, active: true, isSupport: false, assignedFromUserId: null, role: { notIn: ["CLIENT", "CAREGIVER"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

/**
 * Makes `email` an OWNER of an existing workspace and emails them an invite
 * (a set-password link) — the way back in when an owner's email was mistyped
 * at creation or the only owner deactivated themselves. An existing account
 * with that email is promoted and reactivated; otherwise one is created.
 */
export async function inviteOwner(orgId: string, input: { name: string; email: string }, invitedBy?: string) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new UserFacingError("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserFacingError("Enter a valid email");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, slug: true } });
  if (org.slug === PLATFORM_SLUG) throw new UserFacingError("Add platform admins with scripts/create-platform-admin.ts");

  const t = tenantDb(org.id);
  const existing = await t.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  const owner = existing
    ? await t.user.update({ where: { id: existing.id }, data: { role: "OWNER", active: true }, select: { id: true, name: true, email: true } })
    : await t.user.create({
        data: { name, email, role: "OWNER", passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
        select: { id: true, name: true, email: true },
      });
  let inviteSent = true;
  try {
    await runAsTenant(org, () => sendInviteEmail(owner, invitedBy));
  } catch (error) {
    console.error(`Failed to send owner invite for ${org.slug}:`, error);
    inviteSent = false;
  }
  return { userId: owner.id, created: !existing, inviteSent };
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
      isSupport: false,
      // Linked accounts are reached through the switcher, not signed into directly.
      assignedFromUserId: null,
      organization: { status: "ACTIVE", slug: { not: PLATFORM_SLUG } },
    },
    select: { organization: { select: { name: true, slug: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  return users.map((u) => u.organization);
}

// --- Offboarding -----------------------------------------------------------
// Export and hard-delete one organization. Tables are discovered from the
// catalog (every table with an "organizationId" column, plus Prisma's
// implicit join tables), so new models are covered without touching this.

type TenantTables = { tables: string[]; joinTables: { table: string; aTable: string; bTable: string }[] };

async function tenantTables(): Promise<TenantTables> {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organizationId' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  const joinTables = await prisma.$queryRaw<{ table: string; aTable: string; bTable: string }[]>`
    SELECT c.relname AS "table",
      (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'A') AS "aTable",
      (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
         JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'B') AS "bTable"
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND left(c.relname, 1) = '_' AND c.relname <> '_prisma_migrations'`;
  return { tables: tables.map((t) => t.table_name), joinTables: joinTables.filter((j) => j.aTable && j.bTable) };
}

// Identifiers come only from the catalog queries above, never from input.
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Everything the organization owns, as plain rows per table, plus every
 * storage key those rows reference (for fetching the files from GCS).
 */
export async function exportOrganizationData(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const { tables, joinTables } = await tenantTables();
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    data[table] = await prisma.$queryRawUnsafe(`SELECT * FROM ${ident(table)} WHERE "organizationId" = $1 ORDER BY 1`, orgId);
  }
  for (const j of joinTables) {
    data[j.table] = await prisma.$queryRawUnsafe(
      `SELECT * FROM ${ident(j.table)} WHERE "A" IN (SELECT id FROM ${ident(j.aTable)} WHERE "organizationId" = $1)`,
      orgId
    );
  }
  const storageKeys = new Set<string>();
  for (const rows of Object.values(data)) {
    for (const row of rows as Record<string, unknown>[]) {
      for (const [column, value] of Object.entries(row)) {
        if (/storagekey$/i.test(column) && typeof value === "string" && value) storageKeys.add(value);
      }
    }
  }
  return { organization: org, exportedAt: new Date().toISOString(), data, storageKeys: [...storageKeys].sort() };
}

/**
 * Permanently deletes an organization and every row it owns, in one
 * transaction (all or nothing). Children go before parents: each pass
 * deletes what it can and retries tables still blocked by a foreign key.
 * Doesn't touch stored files — the caller deletes those (exportOrganizationData
 * lists their keys) after this succeeds.
 */
export async function deleteOrganization(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
  const template = process.env.TEMPLATE_ORG_SLUG ?? "ctk";
  if (org.slug === PLATFORM_SLUG) throw new UserFacingError("The platform organization can't be deleted");
  if (org.slug === template) throw new UserFacingError(`"${org.slug}" is the template organization new workspaces are copied from — change TEMPLATE_ORG_SLUG first`);

  const { tables, joinTables } = await tenantTables();
  const deleted: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      // Its people's linked accounts in the workspaces it managed stay there
      // (their history does), switched off; the assignments go with the org.
      await tx.$executeRawUnsafe(
        `UPDATE users SET active = false WHERE id IN (SELECT "userId" FROM workspace_assignments WHERE "homeOrgId" = $1)`,
        orgId
      );
      for (const j of joinTables) {
        deleted[j.table] = await tx.$executeRawUnsafe(
          `DELETE FROM ${ident(j.table)} WHERE "A" IN (SELECT id FROM ${ident(j.aTable)} WHERE "organizationId" = $1)`,
          orgId
        );
      }
      let remaining = [...tables];
      for (let pass = 0; pass < tables.length && remaining.length > 0; pass++) {
        const blocked: string[] = [];
        for (const table of remaining) {
          await tx.$executeRawUnsafe("SAVEPOINT delete_table");
          try {
            deleted[table] = (deleted[table] ?? 0) + (await tx.$executeRawUnsafe(`DELETE FROM ${ident(table)} WHERE "organizationId" = $1`, orgId));
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT delete_table");
          } catch {
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT delete_table");
            blocked.push(table);
          }
        }
        remaining = blocked;
      }
      if (remaining.length > 0) throw new Error(`Couldn't delete rows from: ${remaining.join(", ")}`);
      await tx.organization.delete({ where: { id: orgId } });
    },
    { timeout: 120_000 }
  );
  forgetOrg(org.slug);
  return deleted;
}
