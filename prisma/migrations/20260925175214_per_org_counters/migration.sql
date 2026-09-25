-- Multitenancy Phase 3b: invoice/receipt display numbers count per
-- organization instead of from one global sequence each (which would
-- interleave tenants: org A's invoices 1, 2, 5; org B's 3, 4).
--
-- The seq columns default to next_invoice_seq()/next_receipt_seq(), which
-- take the next value from org_counters for current_org_id() — the same
-- transaction-local app.org_id the organizationId default uses. The counter
-- row is updated inside the inserting transaction, so it's row-locked (no
-- duplicates under concurrency) and a rolled-back insert doesn't burn a
-- number.
--
-- (Hand-written: Prisma's generated diff emitted SET DEFAULT followed by
-- DROP DEFAULT on the same column.)

CREATE TABLE "org_counters" (
    "organizationId" TEXT NOT NULL DEFAULT current_org_id(),
    "kind" TEXT NOT NULL,
    "next" INTEGER NOT NULL,

    CONSTRAINT "org_counters_pkey" PRIMARY KEY ("organizationId","kind")
);

ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Returns the next value of the current org's `counter_kind` counter,
-- creating the counter at 1 on first use.
CREATE OR REPLACE FUNCTION next_org_counter(counter_kind text) RETURNS integer
  LANGUAGE plpgsql
  AS $$
DECLARE
  org   text := current_org_id();
  value integer;
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'no organization context (app.org_id) for the % counter', counter_kind
      USING ERRCODE = 'not_null_violation';
  END IF;
  INSERT INTO org_counters ("organizationId", kind, next)
    VALUES (org, counter_kind, 2)
    ON CONFLICT ("organizationId", kind) DO UPDATE SET next = org_counters.next + 1
    RETURNING next - 1 INTO value;
  RETURN value;
END
$$;

-- Argument-free wrappers: Prisma introspects a plain function-call default
-- as dbgenerated("next_invoice_seq()") and diffs it clean; one with a
-- string argument comes back cast-decorated and never matches.
CREATE OR REPLACE FUNCTION next_invoice_seq() RETURNS integer LANGUAGE sql VOLATILE AS $$ SELECT next_org_counter('invoice') $$;
CREATE OR REPLACE FUNCTION next_receipt_seq() RETURNS integer LANGUAGE sql VOLATILE AS $$ SELECT next_org_counter('receipt') $$;

-- Existing numbers carry on where they left off, per org.
INSERT INTO org_counters ("organizationId", kind, next)
  SELECT "organizationId", 'invoice', max(seq) + 1 FROM invoices GROUP BY "organizationId";
INSERT INTO org_counters ("organizationId", kind, next)
  SELECT "organizationId", 'receipt', max(seq) + 1 FROM receipts GROUP BY "organizationId";

ALTER TABLE "invoices" ALTER COLUMN "seq" SET DEFAULT next_invoice_seq();
DROP SEQUENCE "invoices_seq_seq";
ALTER TABLE "receipts" ALTER COLUMN "seq" SET DEFAULT next_receipt_seq();
DROP SEQUENCE "receipts_seq_seq";

CREATE UNIQUE INDEX "invoices_organizationId_seq_key" ON "invoices"("organizationId", "seq");
CREATE UNIQUE INDEX "receipts_organizationId_seq_key" ON "receipts"("organizationId", "seq");
