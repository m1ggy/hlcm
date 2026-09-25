import { execSync } from "node:child_process";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-database-url";

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

  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
