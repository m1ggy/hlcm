import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Tenant isolation: app code goes through the org-scoped client in
  // src/lib/db.ts. The raw client ignores organizationId entirely — only the
  // files that genuinely work across orgs may import it (see
  // docs/multitenancy-plan.md, Phase 2).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/db.ts", "src/lib/tenant.ts", "src/lib/prisma.ts", "src/lib/platform.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/prisma",
              message: "Use `db` from @/lib/db — the raw client isn't tenant-scoped.",
            },
          ],
          patterns: [
            {
              group: ["**/lib/prisma"],
              message: "Use `db` from @/lib/db — the raw client isn't tenant-scoped.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
