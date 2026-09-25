// Shared setup for one-off scripts and seeds: they read and write through the
// same tenant-scoped client as the app (src/lib/db.ts), for one organization
// picked by ORG_SLUG (default "ctk").
//   ORG_SLUG=acme npx tsx scripts/seed-demo.ts
import "dotenv/config";
import { prisma } from "../../src/lib/prisma";
import { db, runAsTenant } from "../../src/lib/db";

export { db };

export function runScriptAsTenant(main: () => Promise<void>) {
  const slug = process.env.ORG_SLUG ?? "ctk";
  return (async () => {
    const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true } });
    if (!org) throw new Error(`No organization with slug "${slug}" — set ORG_SLUG`);
    await runAsTenant(org, main);
  })()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
