// Seeds (or refreshes) the pipeline stage catalog for one organization —
// the catalog itself lives in src/lib/pipeline-stage-catalog.ts.
//
// Run: npx tsx scripts/seed-pipeline-stages.ts   (ORG_SLUG=<slug> for another org)
import "dotenv/config";
import { db as prisma, runScriptAsTenant } from "./lib/tenant-script";
import { upsertPipelineStages } from "../src/lib/pipeline-stage-catalog";

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found — seed a user first.");
  const { stageCount, backwardWired } = await upsertPipelineStages(admin.id);
  console.log(`Upserted ${stageCount} pipeline stages.`);
  console.log(`Wired backward-move whitelist for ${backwardWired} stages.`);
}

runScriptAsTenant(main);
