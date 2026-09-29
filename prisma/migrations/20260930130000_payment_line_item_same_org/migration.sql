-- Same-org trigger for payments.lineItemId (added in
-- 20260929120000_payment_line_item). Kept out of that migration so its
-- file stays byte-identical to the one production applied from main,
-- before multitenancy — Prisma flags an applied migration whose file later
-- changed. ensure_same_org_triggers() is idempotent.
SELECT ensure_same_org_triggers();
