// Populates the PipelineStage catalog from docs/pipeline-stage-plan.md — the
// ordered stage list, hex color, and abbreviation for each of the three
// pipelines (Home Care, CILA/Group Home, MCO), plus the 3 exit statuses
// available from any stage in every pipeline.
//
// Idempotent: stages are upserted on the (pipeline, abbrev) unique key, so
// re-running after a hex/label tweak updates in place instead of duplicating.
// Backward-move links (allowedBackwardStageIds) are wired in a second pass
// once every stage row exists, since they reference other stages' ids.
//
// Run: npx tsx scripts/seed-pipeline-stages.ts
import "dotenv/config";
import { PrismaClient, Pipeline } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type StageSeed = {
  pipeline: Pipeline;
  abbrev: string;
  name: string;
  sortOrder: number;
  hex: string;
  colorLabel: string;
  isExitStatus?: boolean;
  requiresReason?: boolean;
  requiresFollowUpDate?: boolean;
};

const HOME_CARE: StageSeed[] = [
  { pipeline: "HOME_CARE", abbrev: "WCD", name: "HC Waiting on Client Docs", sortOrder: 10, hex: "#9E9E9E", colorLabel: "Gray" },
  { pipeline: "HOME_CARE", abbrev: "CAP", name: "HC Completing Application", sortOrder: 20, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "HOME_CARE", abbrev: "SVR", name: "HC Supervisor Review", sortOrder: 30, hex: "#9C27B0", colorLabel: "Purple" },
  { pipeline: "HOME_CARE", abbrev: "RTS", name: "HC Ready to Submit", sortOrder: 40, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "HOME_CARE", abbrev: "SUB", name: "HC Submitted to Agency", sortOrder: 50, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "HOME_CARE", abbrev: "COR", name: "HC Corrections Received", sortOrder: 60, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "HOME_CARE", abbrev: "LRD", name: "HC License Released", sortOrder: 70, hex: "#4CAF50", colorLabel: "Green" },
];

const CILA_GROUP_HOME: StageSeed[] = [
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 WCD", name: "Step I Waiting on Client Docs", sortOrder: 10, hex: "#9E9E9E", colorLabel: "Gray" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 CAP", name: "Step I Completing Application", sortOrder: 20, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 SVR", name: "Step I Supervisor Review", sortOrder: 30, hex: "#9C27B0", colorLabel: "Purple" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 RTS", name: "Step I Ready to Submit", sortOrder: 40, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 SUB", name: "Step I Submitted to IDHS", sortOrder: 50, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 COR", name: "Step I Corrections Received", sortOrder: 60, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S1 APM", name: "Step I Approved, Await Mock", sortOrder: 70, hex: "#FFB74D", colorLabel: "Light Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "CMK", name: "CTK Internal Mock Scheduled", sortOrder: 80, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "WMK", name: "Waiting for IDHS Mock", sortOrder: 90, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "MKF", name: "Mock Failed, Remediation", sortOrder: 100, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "MKP", name: "Mock Passed, Await Oral Exam", sortOrder: 110, hex: "#FFB74D", colorLabel: "Light Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "COM", name: "CTK Oral Mock Scheduled", sortOrder: 120, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "WOE", name: "Waiting for IDHS Oral Exam", sortOrder: 130, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "OEF", name: "Oral Failed, Remediation", sortOrder: 140, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "HRQ", name: "Hearing Requested", sortOrder: 150, hex: "#B71C1C", colorLabel: "Dark Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "HRS", name: "Hearing Scheduled", sortOrder: 160, hex: "#B71C1C", colorLabel: "Dark Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "HRW", name: "Hearing Won, Resuming", sortOrder: 170, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 CAP", name: "Step II Completing Application", sortOrder: 180, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 SVR", name: "Step II Supervisor Review", sortOrder: 190, hex: "#9C27B0", colorLabel: "Purple" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 RTS", name: "Step II Ready to Submit", sortOrder: 200, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 SUB", name: "Step II Submitted to IDHS", sortOrder: 210, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 COR", name: "Step II Corrections Received", sortOrder: 220, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "S2 ACC", name: "Step II Accepted by IDHS", sortOrder: 230, hex: "#8BC34A", colorLabel: "Light Green" },
  { pipeline: "CILA_GROUP_HOME", abbrev: "LRD", name: "CILA License Released", sortOrder: 240, hex: "#4CAF50", colorLabel: "Green" },
];

const MCO: StageSeed[] = [
  { pipeline: "MCO", abbrev: "WCD", name: "MCO Waiting on Client Docs", sortOrder: 10, hex: "#9E9E9E", colorLabel: "Gray" },
  { pipeline: "MCO", abbrev: "CAP", name: "MCO Completing Application", sortOrder: 20, hex: "#2196F3", colorLabel: "Blue" },
  { pipeline: "MCO", abbrev: "SVR", name: "MCO Supervisor Review", sortOrder: 30, hex: "#9C27B0", colorLabel: "Purple" },
  { pipeline: "MCO", abbrev: "RTS", name: "MCO Ready to Submit", sortOrder: 40, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "MCO", abbrev: "SUB", name: "MCO Submitted", sortOrder: 50, hex: "#FF9800", colorLabel: "Orange" },
  { pipeline: "MCO", abbrev: "COR", name: "MCO Corrections / Info Requested", sortOrder: 60, hex: "#F44336", colorLabel: "Red" },
  { pipeline: "MCO", abbrev: "CIR", name: "MCO Credentialing In Review", sortOrder: 70, hex: "#FFB74D", colorLabel: "Light Orange" },
  { pipeline: "MCO", abbrev: "APC", name: "MCO Approved, Contracting", sortOrder: 80, hex: "#009688", colorLabel: "Teal" },
  { pipeline: "MCO", abbrev: "CSL", name: "MCO Contract Signed, Await Load", sortOrder: 90, hex: "#FFB74D", colorLabel: "Light Orange" },
  { pipeline: "MCO", abbrev: "ENR", name: "MCO Enrolled / Effective", sortOrder: 100, hex: "#4CAF50", colorLabel: "Green" },
  { pipeline: "MCO", abbrev: "DEN", name: "MCO Denied", sortOrder: 110, hex: "#B71C1C", colorLabel: "Dark Red" },
];

// Exit statuses: available from any stage, in every pipeline — seeded once
// per pipeline so Application.stageId can always point within its own
// pipeline's stage set.
function exitStatuses(pipeline: Pipeline): StageSeed[] {
  return [
    { pipeline, abbrev: "HLD", name: "On Hold", sortOrder: 900, hex: "#FFC107", colorLabel: "Yellow", isExitStatus: true, requiresReason: true, requiresFollowUpDate: true },
    { pipeline, abbrev: "WDN", name: "Withdrawn / Closed", sortOrder: 910, hex: "#212121", colorLabel: "Black", isExitStatus: true, requiresReason: true },
    { pipeline, abbrev: "HRL", name: "Hearing Lost, Closed", sortOrder: 920, hex: "#212121", colorLabel: "Black", isExitStatus: true },
  ];
}

const ALL_STAGES: StageSeed[] = [
  ...HOME_CARE,
  ...CILA_GROUP_HOME,
  ...MCO,
  ...exitStatuses("HOME_CARE"),
  ...exitStatuses("CILA_GROUP_HOME"),
  ...exitStatuses("MCO"),
];

// Rule 2 backward-move whitelist: [pipeline, from abbrev, to abbrev]. Every
// other backward move (lower sortOrder, same pipeline) is rejected by the
// stage-change engine (Phase 2). Hearing Won -> Step II Completing
// Application isn't listed here — it's a forward move (sortOrder 170 -> 180)
// already permitted by the default rule.
const BACKWARD_MOVES: [Pipeline, string, string][] = [
  ["HOME_CARE", "SVR", "CAP"],
  ["HOME_CARE", "COR", "SUB"],
  ["CILA_GROUP_HOME", "S1 SVR", "S1 CAP"],
  ["CILA_GROUP_HOME", "S1 COR", "S1 SUB"],
  ["CILA_GROUP_HOME", "S2 SVR", "S2 CAP"],
  ["CILA_GROUP_HOME", "S2 COR", "S2 SUB"],
  ["CILA_GROUP_HOME", "MKF", "CMK"],
  ["CILA_GROUP_HOME", "OEF", "COM"],
  ["MCO", "SVR", "CAP"],
  ["MCO", "COR", "SUB"],
  ["MCO", "DEN", "CAP"],
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found — seed a user first.");

  const stageIds = new Map<string, string>(); // `${pipeline}:${abbrev}` -> id

  for (const stage of ALL_STAGES) {
    const row = await prisma.pipelineStage.upsert({
      where: { pipeline_abbrev: { pipeline: stage.pipeline, abbrev: stage.abbrev } },
      update: {
        name: stage.name,
        sortOrder: stage.sortOrder,
        hex: stage.hex,
        colorLabel: stage.colorLabel,
        isExitStatus: stage.isExitStatus ?? false,
        requiresReason: stage.requiresReason ?? false,
        requiresFollowUpDate: stage.requiresFollowUpDate ?? false,
      },
      create: {
        pipeline: stage.pipeline,
        abbrev: stage.abbrev,
        name: stage.name,
        sortOrder: stage.sortOrder,
        hex: stage.hex,
        colorLabel: stage.colorLabel,
        isExitStatus: stage.isExitStatus ?? false,
        requiresReason: stage.requiresReason ?? false,
        requiresFollowUpDate: stage.requiresFollowUpDate ?? false,
        createdById: admin.id,
      },
    });
    stageIds.set(`${stage.pipeline}:${stage.abbrev}`, row.id);
  }
  console.log(`Upserted ${ALL_STAGES.length} pipeline stages.`);

  // Second pass: wire the backward-move whitelist now that every stage has an id.
  const backwardByFrom = new Map<string, string[]>();
  for (const [pipeline, fromAbbrev, toAbbrev] of BACKWARD_MOVES) {
    const fromKey = `${pipeline}:${fromAbbrev}`;
    const toId = stageIds.get(`${pipeline}:${toAbbrev}`);
    if (!toId) throw new Error(`Backward move target not found: ${pipeline} ${toAbbrev}`);
    const list = backwardByFrom.get(fromKey) ?? [];
    list.push(toId);
    backwardByFrom.set(fromKey, list);
  }

  for (const [fromKey, allowedBackwardStageIds] of backwardByFrom) {
    const fromId = stageIds.get(fromKey);
    if (!fromId) throw new Error(`Backward move source not found: ${fromKey}`);
    await prisma.pipelineStage.update({
      where: { id: fromId },
      data: { allowedBackwardStageIds },
    });
  }
  console.log(`Wired backward-move whitelist for ${backwardByFrom.size} stages.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
