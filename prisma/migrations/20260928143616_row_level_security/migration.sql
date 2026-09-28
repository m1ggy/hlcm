-- Multitenancy Phase 6: Postgres row-level security as the backstop behind
-- the tenant client (src/lib/db.ts). Every tenant table only shows — and only
-- accepts — rows of the organization in the transaction's app.org_id
-- (current_org_id()); with no org set, nothing at all.
--
-- Deliberately ENABLE, not FORCE: the table owner (the role migrations and
-- the few cross-org modules connect as — SYSTEM_DATABASE_URL) is exempt,
-- while the app role (DATABASE_URL, created by scripts/setup-app-db-role.sh)
-- is bound by the policies. Until the app actually connects as that role,
-- this changes nothing: today's connection is the owner.
--
-- Adding a table later: end its migration with
--   SELECT ensure_tenant_policies();
-- tests/row-level-security.test.ts fails until every tenant table has one.

CREATE OR REPLACE FUNCTION ensure_tenant_policies() RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  t record;
  j record;
BEGIN
  -- Every base table with an organizationId column.
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organizationId' AND NOT a.attisdropped)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = current_org_id()) WITH CHECK ("organizationId" = current_org_id())',
      t.table_name
    );
  END LOOP;

  -- Prisma's implicit many-to-many join tables have no organizationId: a
  -- link is visible/insertable only if both ends are (i.e. in this org).
  FOR j IN
    SELECT c.relname AS join_table,
           (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
             JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
             WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'A') AS table_a,
           (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
             JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
             WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'B') AS table_b
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND left(c.relname, 1) = '_'
      AND c.relname <> '_prisma_migrations'
  LOOP
    CONTINUE WHEN j.table_a IS NULL OR j.table_b IS NULL;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', j.join_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', j.join_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %1$I USING (EXISTS (SELECT 1 FROM %2$I x WHERE x.id = %1$I."A" AND x."organizationId" = current_org_id())) '
      || 'WITH CHECK (EXISTS (SELECT 1 FROM %2$I x WHERE x.id = %1$I."A" AND x."organizationId" = current_org_id()) '
      || 'AND EXISTS (SELECT 1 FROM %3$I y WHERE y.id = %1$I."B" AND y."organizationId" = current_org_id()))',
      j.join_table, j.table_a, j.table_b
    );
  END LOOP;

  -- The organizations list itself: the app role only sees its own org.
  ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_organization ON "organizations";
  CREATE POLICY own_organization ON "organizations" USING (id = current_org_id()) WITH CHECK (id = current_org_id());
END
$$;

SELECT ensure_tenant_policies();
