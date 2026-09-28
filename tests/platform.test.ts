import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";
import { getOrgBySlug } from "@/lib/tenant";
import { createOrganization, listOrganizations, setOrganizationStatus } from "@/lib/platform";
import { ALL_STAGES } from "@/lib/pipeline-stage-catalog";
import { orgSlugFromHost, PLATFORM_SLUG } from "@/lib/tenant-host";

// The platform console's operations (5c). Email is blanked in the test env,
// so invites report inviteSent: false instead of sending.

afterAll(async () => {
  await prisma.$disconnect();
});

const input = (slug: string) => ({ name: `Org ${slug}`, slug, ownerName: "Olive Owner", ownerEmail: `owner@${slug}.test` });

describe("createOrganization", () => {
  it("creates the org, its OWNER and its starting setup", async () => {
    const { org, inviteSent } = await createOrganization(input("sunrise"));
    expect(org.slug).toBe("sunrise");
    expect(inviteSent).toBe(false); // no email configured in tests
    const t = tenantDb(org.id);
    const owners = await t.user.findMany({ where: { role: "OWNER" } });
    expect(owners.map((u) => u.email)).toEqual(["owner@sunrise.test"]);
    expect(await t.pipelineStage.count()).toBe(ALL_STAGES.length);
    expect(await t.invoiceProfile.count()).toBe(1);
    const cached = await getOrgBySlug("sunrise");
    expect(cached?.status).toBe("ACTIVE");
  });

  it("normalizes the address and email", async () => {
    const { org } = await createOrganization({ ...input("x"), slug: "  Mixed-Case  ", ownerEmail: "  Owner@Mixed.TEST " });
    expect(org.slug).toBe("mixed-case");
    expect((await tenantDb(org.id).user.findFirst())?.email).toBe("owner@mixed.test");
  });

  it("rejects bad, reserved and taken addresses", async () => {
    await expect(createOrganization(input("-bad-"))).rejects.toThrow(/lowercase letters/);
    await expect(createOrganization(input("admin"))).rejects.toThrow(/reserved/);
    await expect(createOrganization(input("platform"))).rejects.toThrow(/reserved/);
    await expect(createOrganization(input("sunrise"))).rejects.toThrow(/already taken/);
  });

  it("rejects a bad owner email", async () => {
    await expect(createOrganization({ ...input("good-slug"), ownerEmail: "nope" })).rejects.toThrow(/valid owner email/);
    expect(await getOrgBySlug("good-slug")).toBeNull();
  });
});

describe("platform org", () => {
  it("is reached at admin.<root> and hidden from the workspace list", async () => {
    const prev = process.env.ROOT_DOMAIN;
    process.env.ROOT_DOMAIN = "example.test";
    expect(orgSlugFromHost("admin.example.test")).toBe(PLATFORM_SLUG);
    expect(orgSlugFromHost("platform.example.test")).toBeNull();
    process.env.ROOT_DOMAIN = prev;
    expect((await listOrganizations()).some((o) => o.slug === PLATFORM_SLUG)).toBe(false);
  });

  it("can't be suspended", async () => {
    await expect(setOrganizationStatus("org_platform", "SUSPENDED")).rejects.toThrow(/can't be suspended/);
  });
});

describe("setOrganizationStatus", () => {
  it("suspends and reactivates, taking effect immediately", async () => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sunrise" } });
    await getOrgBySlug("sunrise"); // warm the cache
    await setOrganizationStatus(org.id, "SUSPENDED");
    expect((await getOrgBySlug("sunrise"))?.status).toBe("SUSPENDED");
    await setOrganizationStatus(org.id, "ACTIVE");
    expect((await getOrgBySlug("sunrise"))?.status).toBe("ACTIVE");
  });
});
