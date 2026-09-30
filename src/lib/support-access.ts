import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, runAsTenant } from "@/lib/db";
import { issueAuthToken } from "@/lib/auth-tokens";
import { recordAudit } from "@/lib/audit";
import { PRODUCT_NAME } from "@/lib/branding";
import { orgAppUrl } from "@/lib/tenant-host";
import { readSupportAccessUntil } from "@/lib/tenant";
import { UserFacingError } from "@/lib/user-facing-error";

// Platform support access. A workspace owner switches it on for a set time
// (Admin > Organization); while it's on, a platform admin can open the
// workspace from the console as the workspace's own hidden support user —
// an ADMIN account (User.isSupport) that can't sign in with a password, is
// left out of user lists and counts (see hideSupportUser in src/lib/db.ts),
// and records everything it does in the workspace's audit log under its
// name. Each session starts from a single-use SUPPORT_LOGIN link that lives
// for minutes; the session itself ends as soon as the owner's grant does
// (checked on every request in src/auth.ts).

const SUPPORT_EMAIL = "support@platform.invalid";

export const SUPPORT_GRANT_HOURS = [24, 72, 168] as const;

export function isSupportAccessActive(until: Date | null | undefined, now = new Date()) {
  return Boolean(until && until > now);
}

/** The current workspace's support user, created on first use. */
export async function ensureSupportUser() {
  const existing = await db.user.findFirst({ where: { isSupport: true }, select: { id: true } });
  if (existing) return existing;
  return db.user.create({
    data: {
      name: `${PRODUCT_NAME} Support`,
      email: SUPPORT_EMAIL,
      role: "ADMIN",
      isSupport: true,
      emailNotificationsEnabled: false,
      // Never used: support users can only sign in with a SUPPORT_LOGIN link.
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
    },
    select: { id: true },
  });
}

/**
 * Issues a one-time link that opens `org` as its support user, if the
 * owner's support access is on. Logged in the workspace's audit log with the
 * platform admin's email. Returns the link.
 */
export async function startSupportSession(org: { id: string; slug: string; name: string }, adminEmail: string) {
  if (!isSupportAccessActive(await readSupportAccessUntil(org.id))) {
    throw new UserFacingError(`${org.name} hasn't turned on support access. Its owner can do that in Admin > Organization.`);
  }
  const token = await runAsTenant({ id: org.id, slug: org.slug }, async () => {
    const user = await ensureSupportUser();
    const raw = await issueAuthToken(user.id, "SUPPORT_LOGIN");
    await recordAudit({ entityType: "Organization", entityId: org.id, action: "support_session_started", actorId: user.id, newValue: adminEmail });
    return raw;
  });
  return `${orgAppUrl(org.slug)}/support/enter?token=${encodeURIComponent(token)}`;
}

/** Recent support grants, revocations and sessions in the current workspace, newest first. */
export async function listSupportActivity(take = 10) {
  return db.auditLog.findMany({
    where: { entityType: "Organization", action: { in: ["support_access_granted", "support_access_revoked", "support_session_started"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, newValue: true, createdAt: true, actor: { select: { name: true } } },
  });
}
