import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { createOrganization, listStaffOf } from "@/lib/platform";
import { summaryHasHistory } from "@/lib/work-summary";
import { STARTER_PROJECT_NAME } from "@/lib/work-starter";

// Creating a client workspace from the platform console (docs/workspace-tasks-plan.md, Phase 4).

const HOME = { id: "org_onb_home", slug: "onb-home", name: "Managing Co" };
const PLATFORM_ADMIN = { id: "platform_admin_onb", name: "Pat Platform" };
let staffId = "";
let leadId = "";
let caregiverId = "";

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: ["onb-client", "onb-full"] } } });
  await prisma.organization.deleteMany({ where: { id: HOME.id } });
  await prisma.organization.create({ data: HOME });
  const h = tenantDb(HOME.id);
  staffId = (await h.user.create({ data: { name: "Val VA", email: "val@onb-home.test", passwordHash: "x", role: "STAFF" } })).id;
  leadId = (await h.user.create({ data: { name: "Mo Manager", email: "mo@onb-home.test", passwordHash: "x", role: "STAFF" } })).id;
  caregiverId = (await h.user.create({ data: { name: "Cara Giver", email: "cara@onb-home.test", passwordHash: "x", role: "CAREGIVER" } })).id;
});

afterAll(async () => {
  await prisma.workspaceAssignment.deleteMany({ where: { homeOrgId: HOME.id } });
  await prisma.$disconnect();
});

describe("a tasks-only client workspace", () => {
  it("starts with the Getting started project and the picked staff, not the licensing setup", async () => {
    const { org, assignErrors } = await createOrganization(
      {
        name: "Client Co",
        slug: "onb-client",
        ownerName: "Cat Client",
        ownerEmail: "cat@onb-client.test",
        kind: "TASKS",
        managedByOrgId: HOME.id,
        assign: [
          { homeUserId: staffId, role: "STAFF", canAssign: false },
          { homeUserId: leadId, role: "MANAGER", canAssign: true },
          { homeUserId: caregiverId, role: "STAFF", canAssign: false },
        ],
      },
      PLATFORM_ADMIN
    );
    expect(assignErrors).toEqual(["That person can't be assigned"]); // the caregiver; the rest still went through

    const c = tenantDb(org.id);
    const projects = await c.workProject.findMany({ include: { tasks: { orderBy: { sortOrder: "asc" } } } });
    expect(projects.map((p) => p.name)).toEqual([STARTER_PROJECT_NAME]);
    expect(projects[0].tasks.map((t) => t.title)).toContain("Tell us what you need first");
    expect(projects[0].tasks.every((t) => t.clientVisible && t.status === "TODO")).toBe(true);
    // No licensing setup copied from the template workspace.
    expect(await c.checklistItemTemplate.count()).toBe(0);
    // The starter tasks aren't "news": the first summary still explains itself.
    expect(await runAsTenant(org, () => summaryHasHistory("TASKS"))).toBe(false);

    const assignments = await prisma.workspaceAssignment.findMany({ where: { orgId: org.id }, orderBy: { role: "asc" } });
    expect(assignments.map((a) => [a.homeUserId, a.role, a.canAssign])).toEqual([
      [leadId, "MANAGER", true],
      [staffId, "STAFF", false],
    ]);
    const linked = await c.user.findMany({ where: { assignedFromUserId: { not: null } } });
    expect(linked.map((u) => u.email).sort()).toEqual(["mo@onb-home.test", "val@onb-home.test"]);

    // Logged on the assigned person in the managing workspace, naming the platform admin.
    const homeLog = await tenantDb(HOME.id).auditLog.findMany({ where: { action: "workspace_assigned", entityId: org.id } });
    expect(homeLog.map((l) => l.actorId).sort()).toEqual([leadId, staffId].sort());
    expect(homeLog[0].newValue).toContain("Pat Platform (platform console)");
  });

  it("a full workspace gets no starter project and no assignments without a managing company", async () => {
    const { org, assignErrors } = await createOrganization(
      { name: "Full Co", slug: "onb-full", ownerName: "Fay", ownerEmail: "fay@onb-full.test", assign: [{ homeUserId: staffId, role: "STAFF", canAssign: false }] },
      PLATFORM_ADMIN
    );
    expect(assignErrors).toEqual([]);
    expect(await tenantDb(org.id).workProject.count()).toBe(0);
    expect(await prisma.workspaceAssignment.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("lists the managing company's assignable people only", async () => {
    const people = await listStaffOf(HOME.id);
    expect(people.map((p) => p.email)).toEqual(["mo@onb-home.test", "val@onb-home.test"]);
    const client = await prisma.organization.findUniqueOrThrow({ where: { slug: "onb-client" } });
    await expect(listStaffOf(client.id)).rejects.toThrow(/managing company/);
  });
});
