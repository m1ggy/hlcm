import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { tenantDb } from "@/lib/db";

// See prisma/migrations/*_same_org_fk_triggers: a row may only reference rows
// of its own organization.

const ORG_A = "org_trg_a";
const ORG_B = "org_trg_b";

let userA: { id: string };
let userB: { id: string };
let groupA: { id: string };
let groupB: { id: string };

beforeAll(async () => {
  for (const [id, slug] of [[ORG_A, "trg-a"], [ORG_B, "trg-b"]]) {
    await prisma.organization.upsert({ where: { id }, create: { id, slug, name: slug }, update: {} });
  }
  userA = await tenantDb(ORG_A).user.create({ data: { name: "A", email: "trg-a@test.local", passwordHash: "x" } });
  userB = await tenantDb(ORG_B).user.create({ data: { name: "B", email: "trg-b@test.local", passwordHash: "x" } });
  groupA = await tenantDb(ORG_A).clientGroup.create({ data: { name: "trg-group-a", createdById: userA.id } });
  groupB = await tenantDb(ORG_B).clientGroup.create({ data: { name: "trg-group-b", createdById: userB.id } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("trigger coverage", () => {
  it("every foreign key between tenant tables has a same-org trigger", async () => {
    const missing = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class child  ON child.oid = con.conrelid
      JOIN pg_class parent ON parent.oid = con.confrelid
      JOIN pg_namespace ns ON ns.oid = child.relnamespace
      WHERE con.contype = 'f'
        AND ns.nspname = 'public'
        AND parent.relname <> 'organizations'
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = child.oid  AND a.attname = 'organizationId' AND NOT a.attisdropped)
        AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'organizationId' AND NOT a.attisdropped)
        AND NOT EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = child.oid AND t.tgname = left(con.conname, 54) || '_same_org'
        )`;
    // Fix: end the migration that added these with `SELECT ensure_same_org_triggers();`
    expect(missing.map((m) => m.conname)).toEqual([]);
  });

  it("every implicit many-to-many join table has a same-org trigger", async () => {
    const missing = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind = 'r'
        AND c.relname LIKE '\\_%' ESCAPE '\\' AND c.relname <> '_prisma_migrations'
        AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = left(c.relname, 54) || '_same_org')`;
    expect(missing.map((m) => m.relname)).toEqual([]);
  });

  it("covers a meaningful number of foreign keys", async () => {
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%\\_same\\_org' ESCAPE '\\' AND NOT tgisinternal`;
    expect(Number(count)).toBeGreaterThan(100);
  });
});

describe("cross-organization references are rejected", () => {
  it("scalar FK to another org's row", async () => {
    await expect(
      tenantDb(ORG_A).client.create({ data: { name: "x", createdById: userA.id, clientGroupId: groupB.id } })
    ).rejects.toThrow();
  });

  it("connect to another org's row", async () => {
    await expect(
      tenantDb(ORG_A).client.create({
        data: { name: "x", createdBy: { connect: { id: userA.id } }, clientGroup: { connect: { id: groupB.id } } },
      })
    ).rejects.toThrow();
  });

  it("user FK (createdById) to another org's user", async () => {
    await expect(tenantDb(ORG_A).clientGroup.create({ data: { name: "x", createdById: userB.id } })).rejects.toThrow();
  });

  it("re-pointing an existing row at another org's row", async () => {
    const client = await tenantDb(ORG_A).client.create({ data: { name: "movable", createdById: userA.id, clientGroupId: groupA.id } });
    await expect(tenantDb(ORG_A).client.update({ where: { id: client.id }, data: { clientGroupId: groupB.id } })).rejects.toThrow();
    expect((await prisma.client.findUnique({ where: { id: client.id } }))?.clientGroupId).toBe(groupA.id);
  });

  it("implicit many-to-many link (Client ↔ Project) across orgs", async () => {
    const projectB = await tenantDb(ORG_B).project.create({ data: { name: "trg-project-b", createdById: userB.id } });
    await expect(
      tenantDb(ORG_A).client.create({
        data: { name: "linker", createdById: userA.id, projects: { connect: { id: projectB.id } } },
      })
    ).rejects.toThrow();
  });
});

describe("same-organization references still work", () => {
  it("links, many-to-many included", async () => {
    const projectA = await tenantDb(ORG_A).project.create({ data: { name: "trg-project-a", createdById: userA.id } });
    const client = await tenantDb(ORG_A).client.create({
      data: { name: "ok", createdById: userA.id, clientGroupId: groupA.id, projects: { connect: { id: projectA.id } } },
      include: { projects: true },
    });
    expect(client.clientGroupId).toBe(groupA.id);
    expect(client.projects.map((p) => p.id)).toEqual([projectA.id]);
  });

  it("onDelete: SetNull still clears the reference", async () => {
    const group = await tenantDb(ORG_A).clientGroup.create({ data: { name: "doomed", createdById: userA.id } });
    const client = await tenantDb(ORG_A).client.create({ data: { name: "orphaned", createdById: userA.id, clientGroupId: group.id } });
    await tenantDb(ORG_A).clientGroup.delete({ where: { id: group.id } });
    expect((await tenantDb(ORG_A).client.findUnique({ where: { id: client.id } }))?.clientGroupId).toBeNull();
  });
});
