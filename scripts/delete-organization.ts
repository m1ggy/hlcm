// PERMANENTLY deletes an organization: every row it owns (one transaction,
// all or nothing), then its stored files. There is no undo — export first
// (scripts/export-organization.ts) and take a pg_dump.
//
//   npx tsx scripts/delete-organization.ts <slug> --confirm=<slug> [--keep-files]
//
// The platform org and the template org (TEMPLATE_ORG_SLUG, default ctk)
// are refused.
import "dotenv/config";
import { systemPrisma as prisma } from "../src/lib/prisma";
import { deleteOrganization, exportOrganizationData } from "../src/lib/platform";
import { deleteStoredFile, deleteStoredPrefix } from "../src/lib/storage";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  const confirm = args.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);
  if (!slug) throw new Error("Usage: npx tsx scripts/delete-organization.ts <slug> --confirm=<slug> [--keep-files]");
  if (confirm !== slug) throw new Error(`Refusing: pass --confirm=${slug} to delete "${slug}" permanently`);

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization "${slug}"`);

  // Collect file keys before the rows that reference them are gone.
  const { storageKeys } = await exportOrganizationData(org.id);
  const deleted = await deleteOrganization(org.id);
  const rows = Object.values(deleted).reduce((n, c) => n + c, 0);
  console.log(`Deleted organization ${slug}: ${rows} rows.`);

  if (args.includes("--keep-files")) {
    console.log(`Kept ${storageKeys.length} stored files (--keep-files).`);
    return;
  }
  // New files live under org/<id>/; older ones are flat keys, deleted one by one.
  await deleteStoredPrefix(`org/${org.id}/`);
  const legacy = storageKeys.filter((key) => !key.startsWith(`org/${org.id}/`));
  for (const key of legacy) await deleteStoredFile(key);
  console.log(`Deleted stored files under org/${org.id}/ and ${legacy.length} older ones.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
