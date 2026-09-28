import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { testAppDatabaseUrl, testDatabaseUrl } from "./tests/test-database-url";

// Tests run against a real Postgres database (hclm_test by default, next to
// the dev database) — tenant isolation is enforced by the database as much
// as by the app, so mocking the client would test nothing. tests/global-setup.ts
// recreates the schema from prisma/migrations before every run.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: {
      // TEST_RLS=1: the app (and every tenant query in the suite) connects as
      // a restricted role, so row-level security is enforced throughout;
      // fixtures and cross-org code use the owner (SYSTEM_DATABASE_URL).
      DATABASE_URL: process.env.TEST_RLS === "1" ? testAppDatabaseUrl() : testDatabaseUrl(),
      SYSTEM_DATABASE_URL: testDatabaseUrl(),
      // Fixed 32-byte key for src/lib/secrets.ts — test-only, never used elsewhere.
      INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      // Tests must never send real email (the dev .env may hold a Resend key):
      // with these blank, sendEmail fails fast with EmailConfigError.
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    },
    // One shared database: run files one at a time.
    fileParallelism: false,
  },
});
