import "dotenv/config";

/**
 * TEST_DATABASE_URL if set, else DATABASE_URL with the database renamed to
 * hclm_test. Refuses anything whose database name doesn't end in "_test" —
 * global setup drops and recreates the whole schema.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const base = explicit ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL) to run tests");

  const url = new URL(base);
  if (!explicit) url.pathname = "/hclm_test";
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${dbName}" — the test database name must end in "_test"`);
  }
  return url.toString();
}

/** Row-level-security test mode (TEST_RLS=1): the app runs as this restricted role. */
export const TEST_APP_ROLE = "hclm_test_app";
export const TEST_APP_PASSWORD = "hclm_test_app";

/** The test database, connecting as the restricted app role instead of the owner. */
export function testAppDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = TEST_APP_ROLE;
  url.password = TEST_APP_PASSWORD;
  return url.toString();
}
