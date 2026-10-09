import { afterAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/tenant-host";

// DEVELOPER = platform superadmin, and only ever in the platform org.

const EMAILS = ["dev@ctk.role.test", "owner@platform.role.test", "dev@platform.role.test"];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
});

describe("superadmin role", () => {
  it("only a DEVELOPER of the platform org is a platform admin", () => {
    expect(isPlatformAdmin({ orgSlug: "platform", role: "DEVELOPER" })).toBe(true);
    expect(isPlatformAdmin({ orgSlug: "platform", role: "OWNER" })).toBe(false);
    expect(isPlatformAdmin({ orgSlug: "ctk", role: "DEVELOPER" })).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("the database refuses a DEVELOPER in a workspace", async () => {
    await expect(
      tenantDb("org_ctk").user.create({ data: { name: "D", email: EMAILS[0], passwordHash: "x", role: "DEVELOPER" } })
    ).rejects.toThrow(/users_developer_platform_only/);
  });

  it("the database refuses any other role in the platform org", async () => {
    await expect(
      tenantDb("org_platform").user.create({ data: { name: "O", email: EMAILS[1], passwordHash: "x", role: "OWNER" } })
    ).rejects.toThrow(/users_developer_platform_only/);
    const dev = await tenantDb("org_platform").user.create({
      data: { name: "P", email: EMAILS[2], passwordHash: "x", role: "DEVELOPER" },
    });
    expect(dev.role).toBe("DEVELOPER");
  });
});
