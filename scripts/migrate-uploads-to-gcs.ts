// One-off: uploads currently on local disk (UPLOAD_DIR / the hclm_uploads
// volume) predate the GCS switch in src/lib/storage.ts. Run this ONCE on the
// droplet, after copying the old volume contents somewhere readable and
// before removing the volume, to push every existing FileAsset.storageKey
// into the new bucket under the same key (so DB rows keep working
// unchanged). Safe to re-run — skips keys that already exist in the bucket.
//
// Usage: UPLOAD_DIR=/path/to/old/uploads GCS_BUCKET=... GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npx tsx scripts/migrate-uploads-to-gcs.ts
import path from "path";
import { readFile } from "fs/promises";
import { Storage } from "@google-cloud/storage";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const uploadDir = process.env.UPLOAD_DIR;
  const bucketName = process.env.GCS_BUCKET;
  if (!uploadDir) throw new Error("UPLOAD_DIR must point at the old local uploads directory");
  if (!bucketName) throw new Error("GCS_BUCKET env var is required");

  const bucket = new Storage().bucket(bucketName);

  const assets = await prisma.fileAsset.findMany({ select: { storageKey: true } });
  console.log(`${assets.length} file assets to check`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { storageKey } of assets) {
    const remote = bucket.file(storageKey);
    const [exists] = await remote.exists();
    if (exists) {
      skipped++;
      continue;
    }
    try {
      const buffer = await readFile(path.join(uploadDir, storageKey));
      await remote.save(buffer, { resumable: false });
      migrated++;
    } catch (error) {
      failed++;
      console.error(`Failed: ${storageKey}`, error);
    }
  }

  console.log(`Done. migrated=${migrated} skipped=${skipped} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
