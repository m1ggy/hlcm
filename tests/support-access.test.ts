import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { db, runAsTenant } from "@/lib/db";
import { forgetOrg, isActivePlatformAdmin } from "@/lib/tenant";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { listSupportActivity, startSupportSession } from "@/lib/support-access";
import { listOrganizations } from "@/lib/platform";

// A platform admin entering a workspace: no owner grant needed, through a
// one-time link that can't double as a password link, as the admin's own
// hidden OWNER account that stays out of the workspace's user lists — and
// every entry is in the workspace's audit log under the admin's name.

const ORG = { id: "org_support", slug: "support-co", name: "Support Co" };
const ADMIN_EMAIL = "pat@support-platform.test";
let admin: { id: string; name: string; email: string };

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await prisma.organization.create({ data: ORG });
  await prisma.user.create({ data: { organizationId: ORG.id, name: "Owner", email: "owner@support.test", passwordHash: "x", role: "OWNER" } });
  admin = await prisma.user.create({
    data: { organizationId: "org_platform", name: "Pat", email: ADMIN_EMAIL, passwordHash: "x", role: "DEVELOPER" },
    select: { id: true, name: true, email: true },
  });
  forgetOrg(ORG.slug);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: ADMIN_EMAIL } });
  await prisma.$disconnect();
});

describe("platform admin entering a workspace", () => {
  it("issues a one-time link to the admin's own hidden OWNER account, logs it, and keeps it out of user lists", async () => {
    const url = await startSupportSession(ORG, admin);
    const token = new URL(url).searchParams.get("token")!;
    expect(new URL(url).pathname).toBe("/support/enter");

    await runAsTenant(ORG, async () => {
      // Not usable as an invite / password-reset link…
      expect(await consumeAuthToken(token)).toBeNull();
      // …only as a support sign-in, and only once.
      const used = await consumeAuthToken(token, ["SUPPORT_LOGIN"]);
      expect(used?.kind).toBe("SUPPORT_LOGIN");
      expect(await consumeAuthToken(token, ["SUPPORT_LOGIN"])).toBeNull();

      const support = await db.user.findUniqueOrThrow({ where: { id: used!.userId } });
      expect(support).toMatchObject({ isSupport: true, role: "OWNER", platformAdminId: admin.id, name: "Pat (Platform)" });

      expect((await db.user.findMany({ select: { email: true } })).map((u) => u.email)).toEqual(["owner@support.test"]);
      expect(await db.user.count()).toBe(1);

      const activity = await listSupportActivity();
      expect(activity[0]).toMatchObject({ action: "support_session_started", newValue: ADMIN_EMAIL, actor: { name: "Pat (Platform)" } });
    });

    // A second entry by the same admin reuses their account.
    await startSupportSession(ORG, admin);
    expect(await prisma.user.count({ where: { organizationId: ORG.id, isSupport: true } })).toBe(1);

    const listed = (await listOrganizations()).find((o) => o.id === ORG.id)!;
    expect(listed.userCount).toBe(1);
  });

  it("gives each platform admin their own account", async () => {
    const other = { id: "other-admin-id", name: "Quinn", email: "quinn@support-platform.test" };
    await startSupportSession(ORG, other);
    expect(await prisma.user.count({ where: { organizationId: ORG.id, isSupport: true } })).toBe(2);
  });

  it("only honors the link while the admin is an active platform admin", async () => {
    expect(await isActivePlatformAdmin(admin.id)).toBe(true);
    expect(await isActivePlatformAdmin("other-admin-id")).toBe(false);
    await prisma.user.update({ where: { id: admin.id }, data: { active: false } });
    expect(await isActivePlatformAdmin(admin.id)).toBe(false);
  });
});
