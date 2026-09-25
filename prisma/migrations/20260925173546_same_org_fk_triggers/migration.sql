-- Multitenancy Phase 2 (2e'): a row may only reference rows of its own
-- organization. Postgres foreign keys only check that the parent exists, and
-- RLS doesn't apply to FK checks — so without this, org A could attach an
-- Invoice to org B's Client (a scalar clientId or a Prisma `connect`), and an
-- `include` would then hand B's data to A.
--
-- One generic trigger function, one BEFORE INSERT/UPDATE trigger per
-- foreign key between tenant tables. Prisma's drift detection ignores
-- triggers and functions, so these don't fight `migrate dev`.
--
-- Adding a table or relation later: call ensure_same_org_triggers() at the
-- end of that migration. tests/same-org-triggers.test.ts fails until every
-- such foreign key has its trigger.

-- TG_ARGV[0] = parent table, TG_ARGV[1] = FK column on this table.
CREATE OR REPLACE FUNCTION assert_same_org() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  parent_table text := TG_ARGV[0];
  fk_column    text := TG_ARGV[1];
  fk_value     text;
  parent_org   text;
BEGIN
  fk_value := to_jsonb(NEW) ->> fk_column;
  IF fk_value IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT "organizationId" FROM %I WHERE id = $1', parent_table)
    INTO parent_org
    USING fk_value;
  -- A NULL parent_org (no such row) raises too: once RLS is on (Phase 6)
  -- another org's parent is invisible here, while the plain FK check
  -- bypasses RLS and would let it through. A genuinely missing parent was
  -- going to fail its FK constraint anyway — same error class.
  IF parent_org IS DISTINCT FROM NEW."organizationId" THEN
    RAISE EXCEPTION 'cross-organization reference: %.% -> %', TG_TABLE_NAME, fk_column, parent_table
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;

-- Prisma's implicit many-to-many join tables ("A"/"B" columns, no
-- organizationId of their own): both sides must be in the same org.
-- TG_ARGV[0] = table "A" references, TG_ARGV[1] = table "B" references.
CREATE OR REPLACE FUNCTION assert_join_same_org() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  org_a text;
  org_b text;
BEGIN
  EXECUTE format('SELECT "organizationId" FROM %I WHERE id = $1', TG_ARGV[0]) INTO org_a USING NEW."A";
  EXECUTE format('SELECT "organizationId" FROM %I WHERE id = $1', TG_ARGV[1]) INTO org_b USING NEW."B";
  IF org_a IS DISTINCT FROM org_b THEN
    RAISE EXCEPTION 'cross-organization reference: % links % and %', TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1]
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;

-- (Re)creates the trigger for every single-column foreign key from a table
-- with an organizationId column to another such table (organizations itself
-- excluded), plus the implicit join tables. Idempotent.
CREATE OR REPLACE FUNCTION ensure_same_org_triggers() RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  fk record;
  jt record;
  trigger_name text;
BEGIN
  FOR fk IN
    SELECT con.conname,
           child.relname  AS child_table,
           parent.relname AS parent_table,
           att.attname    AS fk_column
    FROM pg_constraint con
    JOIN pg_class child      ON child.oid = con.conrelid
    JOIN pg_class parent     ON parent.oid = con.confrelid
    JOIN pg_namespace ns     ON ns.oid = child.relnamespace
    JOIN pg_attribute att    ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND array_length(con.conkey, 1) = 1
      AND parent.relname <> 'organizations'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = child.oid  AND a.attname = 'organizationId' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = parent.oid AND a.attname = 'organizationId' AND NOT a.attisdropped)
  LOOP
    trigger_name := left(fk.conname, 54) || '_same_org';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, fk.child_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, "organizationId" ON %I FOR EACH ROW EXECUTE FUNCTION assert_same_org(%L, %L)',
      trigger_name, fk.fk_column, fk.child_table, fk.parent_table, fk.fk_column
    );
  END LOOP;

  FOR jt IN
    SELECT c.relname AS join_table,
           (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
             JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
             WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'A') AS table_a,
           (SELECT p.relname FROM pg_constraint k JOIN pg_class p ON p.oid = k.confrelid
             JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
             WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attname = 'B') AS table_b
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_%' ESCAPE '\'
      AND c.relname <> '_prisma_migrations'
  LOOP
    CONTINUE WHEN jt.table_a IS NULL OR jt.table_b IS NULL;
    trigger_name := left(jt.join_table, 54) || '_same_org';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, jt.join_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION assert_join_same_org(%L, %L)',
      trigger_name, jt.join_table, jt.table_a, jt.table_b
    );
  END LOOP;
END
$$;

SELECT ensure_same_org_triggers();
