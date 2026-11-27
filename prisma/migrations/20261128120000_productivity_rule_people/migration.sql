-- App rules can name several people instead of one (Admin > Activity > App rules).
-- userIds has no FK, so no same-org trigger: the server action checks every
-- id is a user in the caller's workspace before saving.
ALTER TABLE "productivity_rules" ADD COLUMN "userIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "productivity_rules" SET "userIds" = ARRAY["userId"] WHERE "userId" IS NOT NULL;

DROP TRIGGER IF EXISTS "productivity_rules_userId_fkey_same_org" ON "productivity_rules";
ALTER TABLE "productivity_rules" DROP CONSTRAINT IF EXISTS "productivity_rules_userId_fkey";
ALTER TABLE "productivity_rules" DROP COLUMN "userId";
