import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { testDatabaseUrl } from "./tests/test-database-url";

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
    env: { DATABASE_URL: testDatabaseUrl() },
    // One shared database: run files one at a time.
    fileParallelism: false,
  },
});
