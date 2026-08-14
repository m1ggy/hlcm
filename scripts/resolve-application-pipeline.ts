// One-off correction for an Application the automatic backfill (see
// backfill-application-stages.ts) couldn't place — usually a legacy row with
// no LicenseTypeTemplate set, so pipeline can't be inferred from license
// type. You supply the pipeline directly; the stage is still derived from
// the case's existing `status` value via the same STATUS_TO_STAGE mapping
// the automatic backfill uses (src/lib/pipeline.ts), so you don't need to
// know or guess the real-world stage by hand.
//
// Run: npx tsx scripts/resolve-application-pipeline.ts <applicationId> <HOME_CARE|CILA_GROUP_HOME|MCO>
import "dotenv/config";
import { PrismaClient, Pipeline } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { STATUS_TO_STAGE } from "../src/lib/pipeline";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [applicationId, pipelineArg] = process.argv.slice(2);
  if (!applicationId || !pipelineArg) {
    console.error("Usage: npx tsx scripts/resolve-application-pipeline.ts <applicationId> <HOME_CARE|CILA_GROUP_HOME|MCO>");
    process.exit(1);
  }
  if (!["HOME_CARE", "CILA_GROUP_HOME", "MCO"].includes(pipelineArg)) {
    console.error(`Unknown pipeline "${pipelineArg}". Must be HOME_CARE, CILA_GROUP_HOME, or MCO.`);
    process.exit(1);
  }
  const pipeline = pipelineArg as Pipeline;

  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (app.stageId) {
    console.log(`"${app.name}" already has a stage set — nothing to do.`);
    return;
  }

  const targetAbbrev = STATUS_TO_STAGE[pipeline][app.status];
  if (!targetAbbrev) {
    console.error(
      `Can't auto-resolve: status ${app.status} in ${pipeline} is ${
        targetAbbrev === null ? "ambiguous" : "not mapped"
      }. Set pipeline/stageId directly instead.`
    );
    process.exit(1);
  }

  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { pipeline, abbrev: targetAbbrev } });

  await prisma.$transaction([
    prisma.application.update({ where: { id: app.id }, data: { pipeline, stageId: stage.id } }),
    prisma.stageHistory.create({
      data: { applicationId: app.id, stageId: stage.id, enteredAt: app.updatedAt, actorId: app.createdById },
    }),
  ]);

  console.log(`"${app.name}" -> ${pipeline} / ${stage.abbrev} (${stage.name})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
