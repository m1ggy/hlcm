// One-time backfill: sets Application.pipeline/stageId from the old
// ApplicationStatus enum + LicenseTypeTemplate, per the mapping table in
// docs/pipeline-stage-plan.md. Also writes one StageHistory row per
// backfilled Application (enteredAt = its updatedAt, the closest real
// timestamp we have — true per-stage history wasn't tracked before this).
//
// Idempotent: only touches rows where stageId is still null, so re-running
// after resolving a flagged row picks up just that row.
//
// Deliberately conservative: a status this script can't confidently map is
// left alone and reported, never guessed. Application.pipeline/stageId stay
// nullable until every row is resolved.
//
// Run: npx tsx scripts/backfill-application-stages.ts
import "dotenv/config";
import { PrismaClient, Pipeline } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { pipelineForLicenseType } from "../src/lib/pipeline";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// status -> target stage abbrev, per pipeline. `null` means "ambiguous, do
// not auto-map" — reported instead of applied.
const STATUS_TO_STAGE: Record<Pipeline, Partial<Record<string, string | null>>> = {
  HOME_CARE: {
    DRAFT: "WCD",
    INFO_GATHERING: "CAP",
    SUBMITTED: "SUB",
    UNDER_AGENCY_REVIEW: "SUB",
    NEEDS_REVISION: "COR",
    APPROVED: "LRD",
    DENIED: "WDN",
    CLOSED: "WDN",
  },
  CILA_GROUP_HOME: {
    DRAFT: "S1 WCD",
    INFO_GATHERING: "S1 CAP",
    SUBMITTED: "S1 SUB",
    UNDER_AGENCY_REVIEW: "S1 SUB",
    NEEDS_REVISION: "S1 COR",
    APPROVED: "S1 APM", // confirmed by CTK — approved, awaiting mock
    DENIED: "WDN",
    CLOSED: "WDN",
  },
  MCO: {},
};

async function main() {
  const apps = await prisma.application.findMany({
    where: { stageId: null },
    include: { licenseTypeTemplate: { select: { name: true } } },
  });

  if (apps.length === 0) {
    console.log("No Applications need backfilling.");
    return;
  }

  const stages = await prisma.pipelineStage.findMany();
  const stageId = (pipeline: Pipeline, abbrev: string) =>
    stages.find((s) => s.pipeline === pipeline && s.abbrev === abbrev)?.id;

  let updated = 0;
  const flagged: string[] = [];

  for (const app of apps) {
    const templateName = app.licenseTypeTemplate?.name;
    const pipeline = pipelineForLicenseType(templateName);
    if (!pipeline) {
      flagged.push(`${app.id} "${app.name}" — no pipeline mapping for license type "${templateName ?? "none"}"`);
      continue;
    }

    const targetAbbrev = STATUS_TO_STAGE[pipeline][app.status];
    if (targetAbbrev === undefined) {
      flagged.push(`${app.id} "${app.name}" — no stage mapping for status ${app.status} in ${pipeline}`);
      continue;
    }
    if (targetAbbrev === null) {
      flagged.push(`${app.id} "${app.name}" — status ${app.status} in ${pipeline} is ambiguous, needs manual review`);
      continue;
    }

    const id = stageId(pipeline, targetAbbrev);
    if (!id) {
      flagged.push(`${app.id} "${app.name}" — target stage ${pipeline}/${targetAbbrev} not found (run the stage seed first?)`);
      continue;
    }

    await prisma.$transaction([
      prisma.application.update({ where: { id: app.id }, data: { pipeline, stageId: id } }),
      prisma.stageHistory.create({
        data: { applicationId: app.id, stageId: id, enteredAt: app.updatedAt, actorId: app.createdById },
      }),
    ]);
    updated++;
  }

  console.log(`Backfilled ${updated} of ${apps.length} Applications.`);
  if (flagged.length > 0) {
    console.log(`\n${flagged.length} left unresolved — set pipeline/stage manually, then re-run:`);
    for (const line of flagged) console.log(`  - ${line}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
