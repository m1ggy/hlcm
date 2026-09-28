import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { currentWorkspaceTimezone, runAsTenant } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { DEFAULT_TIMEZONE } from "@/lib/time-entries";

// The time clock's default zone follows Organization settings, falling back
// to DEFAULT_TIMEZONE only when the workspace hasn't set one.

const WITH_TZ = { id: "org_tz_set", slug: "tz-set" };
const WITHOUT_TZ = { id: "org_tz_unset", slug: "tz-unset" };

beforeAll(async () => {
  await prisma.organization.upsert({ where: { id: WITH_TZ.id }, create: { ...WITH_TZ, name: "TZ", timezone: "America/Denver" }, update: { timezone: "America/Denver" } });
  await prisma.organization.upsert({ where: { id: WITHOUT_TZ.id }, create: { ...WITHOUT_TZ, name: "No TZ" }, update: { timezone: null } });
  forgetOrg(WITH_TZ.slug);
  forgetOrg(WITHOUT_TZ.slug);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("currentWorkspaceTimezone", () => {
  it("uses the organization's timezone, else DEFAULT_TIMEZONE", async () => {
    await expect(runAsTenant(WITH_TZ, currentWorkspaceTimezone)).resolves.toBe("America/Denver");
    await expect(runAsTenant(WITHOUT_TZ, currentWorkspaceTimezone)).resolves.toBe(DEFAULT_TIMEZONE);
  });
});
