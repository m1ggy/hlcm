import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, runAsTenant } from "@/lib/db";
import { issueAuthToken } from "@/lib/auth-tokens";
import { recordAudit } from "@/lib/audit";
import { orgAppUrl } from "@/lib/tenant-host";

// Platform admins entering a workspace. A platform admin (superadmin) can
// open any active workspace from the console — no grant from its owner
// needed — as their own hidden account in it: an OWNER (User.isSupport,
// User.platformAdminId) that can't sign in with a password, is left out of
// user lists and counts (see hideSupportUser in src/lib/db.ts), and is
// named after them, so everything they do is in the workspace's own audit
// log under their name. Owners see every entry in Admin > Organization.
// Each session starts from a single-use SUPPORT_LOGIN link that lives for
// minutes, and ends like any session after 15 idle minutes.

type PlatformAdmin = { id: string; name: string; email: string };

/** `admin`'s hidden account in the current workspace, created on first use. */
export async function ensureSupportUser(admin: PlatformAdmin) {
  const name = `${admin.name} (Platform)`;
  const existing = await db.user.findFirst({ where: { isSupport: true, platformAdminId: admin.id }, select: { id: true, name: true, active: true } });
  if (existing) {
    if (existing.name !== name || !existing.active) await db.user.update({ where: { id: existing.id }, data: { name, active: true } });
    return { id: existing.id };
  }
  return db.user.create({
    data: {
      name,
      // Never emailed; just unique within the workspace.
      email: `platform-${admin.id}@platform.invalid`,
      role: "OWNER",
      isSupport: true,
      platformAdminId: admin.id,
      emailNotificationsEnabled: false,
      // Never used: these accounts can only sign in with a SUPPORT_LOGIN link.
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
    },
    select: { id: true },
  });
}

/**
 * Issues a one-time link that opens `org` as `admin`'s hidden account in it,
 * and records the entry in the workspace's audit log. Returns the link.
 */
export async function startSupportSession(org: { id: string; slug: string; name: string }, admin: PlatformAdmin) {
  const token = await runAsTenant({ id: org.id, slug: org.slug }, async () => {
    const user = await ensureSupportUser(admin);
    const raw = await issueAuthToken(user.id, "SUPPORT_LOGIN");
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "support_session_started", actorId: user.id, newValue: admin.email });
    return raw;
  });
  return `${orgAppUrl(org.slug)}/support/enter?token=${encodeURIComponent(token)}`;
}

/** Platform admins' entries into the current workspace (and the old support grants), newest first. */
export async function listSupportActivity(take = 10) {
  return db.auditLog.findMany({
    where: { entityType: "Organization", action: { in: ["support_access_granted", "support_access_revoked", "support_session_started"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, newValue: true, createdAt: true, actor: { select: { name: true } } },
  });
}
