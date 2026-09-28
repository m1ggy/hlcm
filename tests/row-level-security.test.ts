import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, systemPrisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// Postgres row-level security (Phase 6) — the backstop behind the tenant
// client. Coverage runs always; enforcement needs the app to connect as the
// restricted role (TEST_RLS=1: CI, or locally against a Postgres whose user
// can create roles), since the table owner is exempt by design.

const A = "org_rls_a";
const B = "org_rls_b";
let clientA = "";
let clientB = "";
let projectB = "";

beforeAll(async () => {
  for (const [id, slug] of [[A, "rls-a"], [B, "rls-b"]]) {
    await systemPrisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  const userA = await tenantDb(A).user.create({ data: { name: "A", email: "a@rls.test", passwordHash: "x" } });
  const userB = await tenantDb(B).user.create({ data: { name: "B", email: "b@rls.test", passwordHash: "x" } });
  clientA = (await tenantDb(A).client.create({ data: { name: "rls-client-a", createdById: userA.id } })).id;
  clientB = (await tenantDb(B).client.create({ data: { name: "rls-client-b", createdById: userB.id } })).id;
  projectB = (await tenantDb(B).project.create({ data: { name: "rls-project-b", createdById: userB.id } })).id;
});

afterAll(async () => {
  await systemPrisma.$disconnect();
  await prisma.$disconnect();
});

describe("policy coverage", () => {
  it("every table with an organizationId has RLS on and the tenant_isolation policy", async () => {
    const missing = await systemPrisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organizationId' AND NOT a.attisdropped)
        AND (NOT c.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'))`;
    // Fix: end the migration that added these with `SELECT ensure_tenant_policies();`
    expect(missing.map((m) => m.relname)).toEqual([]);
  });

  it("covers the implicit join table and the organizations list", async () => {
    const rows = await systemPrisma.$queryRaw<{ relname: string; polname: string }[]>`
      SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname IN ('_ClientToProject', 'organizations') ORDER BY c.relname`;
    expect(rows).toEqual([
      { relname: "_ClientToProject", polname: "tenant_isolation" },
      { relname: "organizations", polname: "own_organization" },
    ]);
  });
});

// Queries on the app pool that bypass the tenant client entirely — what a
// forgotten filter or a hand-written raw query would do.
function asOrg<T>(orgId: string | null, fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    if (orgId) await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}

describe.runIf(process.env.TEST_RLS === "1")("enforcement (app role)", () => {
  it("the app connects as a role RLS applies to", async () => {
    const [role] = await prisma.$queryRaw<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(role).toMatchObject({ rolbypassrls: false, rolsuper: false });
  });

  it("with no organization set, nothing is visible", async () => {
    expect(await asOrg(null, (tx) => tx.client.count())).toBe(0);
    expect(await asOrg(null, (tx) => tx.$queryRaw<unknown[]>`SELECT id FROM clients`)).toEqual([]);
  });

  it("an unfiltered query only sees the current organization's rows", async () => {
    const names = await asOrg(A, (tx) => tx.$queryRaw<{ name: string }[]>`SELECT name FROM clients`);
    expect(names.map((n) => n.name)).toEqual(["rls-client-a"]);
    expect(await asOrg(A, (tx) => tx.client.findUnique({ where: { id: clientB } }))).toBeNull();
  });

  it("can't write into another organization", async () => {
    await expect(
      asOrg(A, (tx) => tx.$executeRaw`INSERT INTO clients (id, "organizationId", name, "createdById", "updatedAt")
        SELECT 'rls_smuggled', ${B}, 'smuggled', "createdById", now() FROM clients LIMIT 1`)
    ).rejects.toThrow();
    expect(await systemPrisma.client.count({ where: { id: "rls_smuggled" } })).toBe(0);
  });

  it("can't update, move or delete another organization's rows", async () => {
    expect(await asOrg(A, (tx) => tx.$executeRaw`UPDATE clients SET name = 'hacked' WHERE id = ${clientB}`)).toBe(0);
    expect(await asOrg(A, (tx) => tx.$executeRaw`DELETE FROM clients WHERE id = ${clientB}`)).toBe(0);
    await expect(asOrg(A, (tx) => tx.$executeRaw`UPDATE clients SET "organizationId" = ${B} WHERE id = ${clientA}`)).rejects.toThrow();
    const b = await systemPrisma.client.findUnique({ where: { id: clientB } });
    expect(b?.name).toBe("rls-client-b");
  });

  it("can't link across organizations through the join table", async () => {
    await expect(asOrg(A, (tx) => tx.$executeRaw`INSERT INTO "_ClientToProject" ("A", "B") VALUES (${clientA}, ${projectB})`)).rejects.toThrow();
  });

  it("only sees its own organization in the organizations list", async () => {
    const orgs = await asOrg(A, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations`);
    expect(orgs.map((o) => o.id)).toEqual([A]);
  });

  it("the owner (system) connection is exempt", async () => {
    expect(await systemPrisma.client.count({ where: { id: { in: [clientA, clientB] } } })).toBe(2);
  });
});
