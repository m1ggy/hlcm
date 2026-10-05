-- COMPLETED is superseded by CLOSED (see ClientStatus in schema.prisma).
UPDATE "clients" SET "status" = 'CLOSED' WHERE "status" = 'COMPLETED';
