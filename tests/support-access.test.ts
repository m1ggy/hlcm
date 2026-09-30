import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { db, runAsTenant } from "@/lib/db";
import { forgetOrg, setSupportAccessUntil } from "@/lib/tenant";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { isSupportAccessActive, listSupportActivity, startSupportSession } from "@/lib/support-access";
import { listOrganizations } from "@/lib/platform";

// Platform support access: only while the owner has it on, through a
// one-time link that can't double as a password link, as a support user
// that stays out of the workspace's user lists — and every session is in
// the workspace's audit log.

const ORG = { id: "org_support", slug: "support-co", name: "Support Co" };

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: ORG.id } });
  await prisma.organization.create({ data: ORG });
  await prisma.user.create({ data: { organizationId: ORG.id, name: "Owner", email: "owner@support.test", passwordHash: "x", role: "OWNER" } });
  forgetOrg(ORG.slug);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("support access", () => {
  it("is refused while the owner hasn't turned it on", async () => {
    await expect(startSupportSession(ORG, "pat@platform.test")).rejects.toThrow(/hasn't turned on support access/);
    await setSupportAccessUntil(ORG.id, new Date(Date.now() - 1000));
    await expect(startSupportSession(ORG, "pat@platform.test")).rejects.toThrow(/hasn't turned on support access/);
  });

  it("issues a one-time support link, logs it, and keeps the support user out of user lists", async () => {
    await setSupportAccessUntil(ORG.id, new Date(Date.now() + 60 * 60 * 1000));
    const url = await startSupportSession(ORG, "pat@platform.test");
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
      expect(support).toMatchObject({ isSupport: true, role: "ADMIN" });

      expect((await db.user.findMany({ select: { email: true } })).map((u) => u.email)).toEqual(["owner@support.test"]);
      expect(await db.user.count()).toBe(1);
      expect(await db.user.count({ where: { isSupport: true } })).toBe(1);

      const activity = await listSupportActivity();
      expect(activity[0]).toMatchObject({ action: "support_session_started", newValue: "pat@platform.test" });
    });

    // A second session reuses the same support user.
    await startSupportSession(ORG, "pat@platform.test");
    expect(await prisma.user.count({ where: { organizationId: ORG.id, isSupport: true } })).toBe(1);

    const listed = (await listOrganizations()).find((o) => o.id === ORG.id)!;
    expect(listed.userCount).toBe(1);
    expect(isSupportAccessActive(listed.supportAccessUntil)).toBe(true);
  });
});
