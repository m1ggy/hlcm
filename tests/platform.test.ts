import { afterAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
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

describe("inviteOwner", () => {
  it("creates a new owner, or promotes and reactivates an existing account", async () => {
    const { inviteOwner } = await import("@/lib/platform");
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sunrise" } });
    const t = tenantDb(org.id);

    const fresh = await inviteOwner(org.id, { name: "Second Owner", email: "Second@Sunrise.test" });
    expect(fresh.created).toBe(true);
    expect((await t.user.findUnique({ where: { id: fresh.userId } }))).toMatchObject({ role: "OWNER", email: "second@sunrise.test" });

    const staff = await t.user.create({ data: { name: "Stu", email: "stu@sunrise.test", passwordHash: "x", role: "STAFF", active: false } });
    // An existing account is only promoted when asked to.
    await expect(inviteOwner(org.id, { name: "ignored", email: "stu@sunrise.test" })).rejects.toThrow(/already has a staff account/);
    expect(await t.user.findUnique({ where: { id: staff.id } })).toMatchObject({ role: "STAFF", active: false });
    const promoted = await inviteOwner(org.id, { name: "ignored", email: "stu@sunrise.test", promoteExisting: true });
    expect(promoted).toMatchObject({ created: false, userId: staff.id });
    expect(await t.user.findUnique({ where: { id: staff.id } })).toMatchObject({ role: "OWNER", active: true, name: "Stu" });
  });

  it("never promotes a managing company's assigned staff", async () => {
    const { inviteOwner } = await import("@/lib/platform");
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sunrise" } });
    const t = tenantDb(org.id);
    const linked = await t.user.create({
      data: { name: "Vee", email: "vee@manager.test", passwordHash: "x", role: "STAFF", assignedFromUserId: "home-user-id" },
    });
    await expect(inviteOwner(org.id, { name: "Vee", email: "vee@manager.test", promoteExisting: true })).rejects.toThrow(/assigned staff/);
    expect((await t.user.findUnique({ where: { id: linked.id } }))?.role).toBe("STAFF");
  });

  it("refuses the platform org and bad emails", async () => {
    const { inviteOwner } = await import("@/lib/platform");
    await expect(inviteOwner("org_platform", { name: "X", email: "x@y.test" })).rejects.toThrow(/create-platform-admin/);
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sunrise" } });
    await expect(inviteOwner(org.id, { name: "X", email: "nope" })).rejects.toThrow(/valid email/);
  });
});

describe("createOrganization with assigned staff", () => {
  it("refuses an owner email that belongs to one of the picked staff, before creating anything", async () => {
    const { org: home } = await createOrganization(input("mgr-home"));
    const va = await tenantDb(home.id).user.create({ data: { name: "Val", email: "val@mgr-home.test", passwordHash: "x", role: "STAFF" } });
    await expect(
      createOrganization(
        { ...input("client-co"), ownerEmail: "VAL@mgr-home.test", kind: "TASKS", managedByOrgId: home.id, assign: [{ homeUserId: va.id, role: "STAFF", canAssign: false }] },
        { id: "platform-admin", name: "Pat" }
      )
    ).rejects.toThrow(/one of the staff you picked/);
    expect(await getOrgBySlug("client-co")).toBeNull();
  });
});

describe("getOrganizationDetail", () => {
  it("lists the workspace's own users with their invite state, and leaves out support accounts", async () => {
    const { getOrganizationDetail } = await import("@/lib/platform");
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: "sunrise" } });
    await tenantDb(org.id).user.create({ data: { name: "Support", email: "support@x.test", passwordHash: "x", role: "DEVELOPER", isSupport: true } });
    const detail = await getOrganizationDetail(org.id);
    expect(detail.slug).toBe("sunrise");
    expect(detail.users.some((u) => u.email === "support@x.test")).toBe(false);
    expect(detail.users.some((u) => u.email === "vee@manager.test")).toBe(false);
    expect(detail.users.find((u) => u.email === "owner@sunrise.test")).toMatchObject({ role: "OWNER", invite: "PENDING" });
    await expect(getOrganizationDetail("org_platform")).rejects.toThrow(/not found/);
  });
});
