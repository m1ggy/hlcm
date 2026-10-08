-- Data migration: adds the CILA "Post-License Compliance" (PLA) stage.
-- Mirrors the entry in scripts/seed-pipeline-stages.ts, but the deploy only
-- runs `prisma migrate deploy` (never the seed), so this is what actually
-- puts the row in existing databases.
--
-- sortOrder 930 = right after Hearing Lost (920) in the stage list. Not an
-- exit status — it's ongoing work, so it's also a board column.
--
-- Safe everywhere: a fresh database with no ADMIN user yet inserts nothing
-- (the seed creates it later), and ON CONFLICT skips a database where the
-- seed already created it.
INSERT INTO "pipeline_stages" ("id", "pipeline", "abbrev", "name", "sortOrder", "hex", "colorLabel", "createdById", "updatedAt")
SELECT 'stg_' || md5(random()::text || clock_timestamp()::text), 'CILA_GROUP_HOME', 'PLA', 'Post-License Compliance', 930, '#1B5E20', 'Dark Green', u."id", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."role" = 'ADMIN'
ORDER BY u."createdAt"
LIMIT 1
ON CONFLICT ("pipeline", "abbrev") DO NOTHING;
