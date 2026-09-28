import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { createOrganization, deleteOrganization, exportOrganizationData } from "@/lib/platform";
import { issueAuthToken } from "@/lib/auth-tokens";
import { saveIntegration } from "@/lib/integrations";

// Offboarding (5f): export everything an org owns, then delete it all.

let orgId = "";
let slug = "";

async function countEverywhere(id: string) {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizationId'`;
  let total = 0;
  for (const { table_name } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table_name}" WHERE "organizationId" = $1`, id);
    total += Number(n);
  }
  return total;
}

beforeAll(async () => {
  const { org } = await createOrganization({ name: "Leaving Co", slug: "leaving-co", ownerName: "Lee", ownerEmail: "lee@leaving.test" });
  orgId = org.id;
  slug = org.slug;
  const t = tenantDb(orgId);
  const owner = await t.user.findFirstOrThrow();
  const project = await t.project.create({ data: { name: "P", createdById: owner.id } });
  const client = await t.client.create({ data: { name: "C", createdById: owner.id, projects: { connect: { id: project.id } } } });
  const stage = await t.pipelineStage.findFirstOrThrow({ where: { pipeline: "HOME_CARE" } });
  const app = await t.application.create({
    data: { name: "App", clientId: client.id, assignedUserId: owner.id, createdById: owner.id, pipeline: "HOME_CARE", stageId: stage.id },
  });
  const invoice = await t.invoice.create({ data: { clientId: client.id, applicationId: app.id, createdById: owner.id } });
  await t.invoiceLineItem.create({ data: { invoiceId: invoice.id, description: "Work", quantity: 1, unitPrice: 10 } });
  const payment = await t.payment.create({ data: { invoiceId: invoice.id, amount: 10, paymentMethod: "cash", paidAt: new Date(), recordedById: owner.id } });
  await t.receipt.create({ data: { paymentId: payment.id, invoiceId: invoice.id, storageKey: `org/${orgId}/receipt.pdf` } });
  await t.note.create({ data: { body: "hi", authorId: owner.id, clientId: client.id } });
  await runAsTenant({ id: orgId, slug }, async () => {
    await issueAuthToken(owner.id, "PASSWORD_RESET");
    await saveIntegration("TEAMS", { webhookUrl: "https://example.invalid/hook" });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("exportOrganizationData", () => {
  it("includes every table's rows for the org, the join table, and referenced files", async () => {
    const out = await exportOrganizationData(orgId);
    expect(out.organization.slug).toBe(slug);
    expect(out.data.clients).toHaveLength(1);
    expect(out.data.invoice_line_items).toHaveLength(1);
    expect(out.data._ClientToProject).toHaveLength(1);
    expect(out.data.pipeline_stages.length).toBeGreaterThan(40);
    expect(out.data.organization_integrations).toHaveLength(1);
    expect(out.storageKeys).toContain(`org/${orgId}/receipt.pdf`);
    const everyRowIsTheOrgs = Object.entries(out.data)
      .filter(([table]) => !table.startsWith("_"))
      .every(([, rows]) => (rows as { organizationId: string }[]).every((r) => r.organizationId === orgId));
    expect(everyRowIsTheOrgs).toBe(true);
  });
});

describe("deleteOrganization", () => {
  it("refuses the platform and template orgs", async () => {
    await expect(deleteOrganization("org_platform")).rejects.toThrow(/platform organization/);
    await expect(deleteOrganization("org_ctk")).rejects.toThrow(/template organization/);
  });

  it("removes every row the org owns and the org itself, leaving others untouched", async () => {
    const ctkBefore = await countEverywhere("org_ctk");
    expect(await countEverywhere(orgId)).toBeGreaterThan(50);
    await deleteOrganization(orgId);
    expect(await countEverywhere(orgId)).toBe(0);
    expect(await prisma.organization.findUnique({ where: { id: orgId } })).toBeNull();
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_ClientToProject" WHERE "A" NOT IN (SELECT id FROM clients)`;
    expect(Number(n)).toBe(0);
    expect(await countEverywhere("org_ctk")).toBe(ctkBefore);
  });
});
