// Exports everything one organization owns — every row of every tenant
// table (one JSON file per table) plus, with --files, every stored file its
// rows reference — for handing a leaving customer their data, or keeping a
// copy before deleting a workspace. Runs across orgs, so it's operator-only.
//
//   npx tsx scripts/export-organization.ts <slug> [--out=exports] [--files]
//
// --files downloads from GCS (needs the same GCS credentials as the app).
import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { systemPrisma as prisma } from "../src/lib/prisma";
import { exportOrganizationData } from "../src/lib/platform";
import { readStoredFile } from "../src/lib/storage";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  if (!slug) throw new Error("Usage: npx tsx scripts/export-organization.ts <slug> [--out=exports] [--files]");
  const outRoot = args.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? "exports";
  const withFiles = args.includes("--files");

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`No organization "${slug}"`);

  const out = await exportOrganizationData(org.id);
  const dir = path.join(outRoot, `${slug}-${out.exportedAt.replace(/[:.]/g, "-")}`);
  await mkdir(path.join(dir, "data"), { recursive: true });

  // BigInt (file generations) isn't JSON; write it as a string.
  const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  for (const [table, rows] of Object.entries(out.data)) {
    await writeFile(path.join(dir, "data", `${table}.json`), json(rows));
  }

  const failed: string[] = [];
  if (withFiles) {
    for (const key of out.storageKeys) {
      try {
        const target = path.join(dir, "files", ...key.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, await readStoredFile(key));
      } catch (error) {
        failed.push(key);
        console.error(`Couldn't download ${key}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  await writeFile(
    path.join(dir, "manifest.json"),
    json({
      organization: out.organization,
      exportedAt: out.exportedAt,
      rowCounts: Object.fromEntries(Object.entries(out.data).map(([t, rows]) => [t, rows.length])),
      files: { referenced: out.storageKeys.length, downloaded: withFiles ? out.storageKeys.length - failed.length : 0, failed },
    })
  );
  const rows = Object.values(out.data).reduce((n, r) => n + r.length, 0);
  console.log(`Exported ${slug}: ${rows} rows across ${Object.keys(out.data).length} tables, ${out.storageKeys.length} referenced files${withFiles ? ` (${failed.length} failed)` : " (not downloaded — pass --files)"}`);
  console.log(`-> ${dir}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
