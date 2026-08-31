-- Backfill: turn the old singleton InvoiceSettings row (if any) into the
-- first InvoiceProfile ("CTK", isDefault), and point every existing
-- manual invoice at it, before the old table is dropped below. This runs
-- automatically as part of `prisma migrate deploy` (same as every other
-- migration) rather than a separate manual script, so it's guaranteed to
-- run against production data too, not just whichever environment
-- someone remembers to run a script against by hand.
INSERT INTO "invoice_profiles" ("id", "name", "isDefault", "logoStorageKey", "logoMimeType", "ccEmails", "footerText", "createdAt", "updatedAt")
SELECT 'legacy-ctk-profile', 'CTK', true, "logoStorageKey", "logoMimeType", "ccEmails", "footerText", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "invoice_settings" WHERE "id" = 'singleton'
ON CONFLICT ("id") DO NOTHING;

-- Fresh installs with no InvoiceSettings row at all still need exactly
-- one profile to exist — the app always assumes a default is available.
INSERT INTO "invoice_profiles" ("id", "name", "isDefault", "createdAt", "updatedAt")
SELECT 'legacy-ctk-profile', 'CTK', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "invoice_profiles")
ON CONFLICT ("id") DO NOTHING;

-- Same isManual invariant used throughout src/lib/actions/invoices.ts: a
-- manually-recorded invoice never has a stripeInvoiceId, and never sits
-- in DRAFT (that status only exists on the Stripe-bound flow).
UPDATE "invoices"
SET "invoiceProfileId" = (SELECT "id" FROM "invoice_profiles" WHERE "isDefault" = true LIMIT 1)
WHERE "stripeInvoiceId" IS NULL AND "status" != 'DRAFT' AND "invoiceProfileId" IS NULL;

-- DropTable
DROP TABLE "invoice_settings";
