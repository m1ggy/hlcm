import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_APP_PASSWORD, TEST_APP_ROLE, testDatabaseUrl } from "./test-database-url";

// Creates the test database if needed, wipes it, and applies every migration —
// so tests always run against exactly what `prisma migrate deploy` produces.
export default async function setup() {
  const url = testDatabaseUrl();
  const dbName = new URL(url).pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await adminClient.query(`CREATE DATABASE "${dbName}"`);
  await adminClient.end();

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  // Both set explicitly: prisma.config prefers SYSTEM_DATABASE_URL, and a
  // dev .env pointing it at the dev database must never be migrated here.
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url, SYSTEM_DATABASE_URL: url }, stdio: "pipe" });

  if (process.env.TEST_RLS === "1") await createAppRole(url);
}

// Mirrors scripts/app-db-role.sql: a login role that isn't the owner and
// can't bypass RLS, with data privileges only. Needs a connection that can
// create roles (CI's Postgres service user; locally, the docker Postgres).
async function createAppRole(url: string) {
  const owner = decodeURIComponent(new URL(url).username);
  const dbName = new URL(url).pathname.slice(1);
  const client = new Client({ connectionString: url });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [TEST_APP_ROLE]);
  if (exists.rowCount === 0) await client.query(`CREATE ROLE "${TEST_APP_ROLE}" LOGIN`);
  await client.query(`ALTER ROLE "${TEST_APP_ROLE}" WITH LOGIN PASSWORD '${TEST_APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
  await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${TEST_APP_ROLE}"`);
  await client.query(`GRANT USAGE ON SCHEMA public TO "${TEST_APP_ROLE}"`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${TEST_APP_ROLE}"`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${TEST_APP_ROLE}"`);
  await client.query(`REVOKE ALL ON TABLE "_prisma_migrations" FROM "${TEST_APP_ROLE}"`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${TEST_APP_ROLE}"`);
  await client.end();
}
