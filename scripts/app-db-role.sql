-- Creates/updates the restricted role the app connects as (DATABASE_URL),
-- so Postgres row-level security applies to every tenant query (see
-- prisma/migrations/*_row_level_security). The table owner stays the
-- migration / cross-org role (SYSTEM_DATABASE_URL). Idempotent.
--
-- Run as a role that can create roles (the docker postgres superuser):
--   psql -v role=hclm_app -v password=… -v owner=hclm -v dbname=hclm -f scripts/app-db-role.sql
-- Normally via scripts/setup-app-db-role.sh.

SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec

-- No superuser, no BYPASSRLS, not the owner: RLS policies bind it.
ALTER ROLE :"role" WITH LOGIN PASSWORD :'password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE :"dbname" TO :"role";
GRANT USAGE ON SCHEMA public TO :"role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"role";
-- Migrations are the owner's business.
REVOKE ALL ON TABLE "_prisma_migrations" FROM :"role";

-- Tables/sequences future migrations create (as the owner) get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"role";
