// Populates the structural reference data admins configure once and staff
// pick from every day: License Types, Case Types, and the Checklist Item
// Templates that clone onto a new Application's task list.
//
// Idempotent: license types / case types are looked up by name before
// creating (no unique constraint on name, so a blind create would dupe on
// rerun); checklist templates are only seeded once (skipped if any already
// exist) since there's no natural unique key to dedupe against.
//
// Run: npx tsx scripts/seed-reference-data.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function ensureLicenseType(name: string, description: string, createdById: string) {
  const existing = await prisma.licenseTypeTemplate.findFirst({ where: { name } });
  if (existing) return existing;
  const created = await prisma.licenseTypeTemplate.create({ data: { name, description, createdById } });
  console.log(`+ License type: ${name}`);
  return created;
}

async function ensureCaseType(name: string, description: string | undefined, createdById: string) {
  const existing = await prisma.caseType.findFirst({ where: { name } });
  if (existing) return existing;
  const created = await prisma.caseType.create({ data: { name, description, createdById } });
  console.log(`+ Case type: ${name}`);
  return created;
}

type TemplateItem = {
  phaseName?: string;
  label: string;
  description?: string;
};

async function seedChecklist(
  licenseTypeTemplateId: string | null,
  caseTypeId: string,
  items: TemplateItem[],
  createdById: string
) {
  for (const [i, item] of items.entries()) {
    await prisma.checklistItemTemplate.create({
      data: {
        licenseTypeTemplateId,
        caseTypeId,
        label: item.label,
        description: item.description,
        phaseName: item.phaseName,
        sortOrder: i,
        createdById,
      },
    });
  }
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found — seed a user first.");

  const cila = await ensureLicenseType("CILA", "Community Integrated Living Arrangement", admin.id);
  await ensureLicenseType("IDPH", "Illinois Department of Public Health", admin.id);
  await ensureLicenseType("IDOA", "Illinois Department on Aging", admin.id);

  const renewal = await ensureCaseType("Renewal", undefined, admin.id);
  const newCase = await ensureCaseType("New", undefined, admin.id);
  const changeOfOwnership = await ensureCaseType("Change of Ownership", undefined, admin.id);
  const postLicense = await ensureCaseType("Post-License/Ongoing", undefined, admin.id);

  const templateCount = await prisma.checklistItemTemplate.count();
  if (templateCount > 0) {
    console.log(`Checklist item templates already exist (${templateCount}) — skipping template seed.`);
    return;
  }

  // CILA + Renewal — standard renewal checklist.
  await seedChecklist(cila.id, renewal.id, [
    { phaseName: "Intake", label: "Collect facility floor plan" },
    { phaseName: "Intake", label: "Verify staff certifications on file" },
    { phaseName: "Filing", label: "Submit renewal application to IDPH" },
    { phaseName: "Filing", label: "Schedule agency site visit" },
    { phaseName: "Review", label: "Upload fire safety inspection report" },
    { phaseName: "Review", label: "Client sign-off on final packet" },
  ], admin.id);

  // CILA + New — initial licensing, a few extra intake/filing steps.
  await seedChecklist(cila.id, newCase.id, [
    { phaseName: "Intake", label: "Collect facility floor plan" },
    { phaseName: "Intake", label: "Verify staff certifications on file" },
    { phaseName: "Intake", label: "Confirm zoning and occupancy approval" },
    { phaseName: "Filing", label: "Submit initial license application to IDPH" },
    { phaseName: "Filing", label: "Submit staff background check clearances" },
    { phaseName: "Review", label: "Schedule initial licensing site visit" },
    { phaseName: "Review", label: "Upload fire safety inspection report" },
    { phaseName: "Review", label: "Client sign-off on final packet" },
  ], admin.id);

  // Wildcard (no license type) — Change of Ownership applies regardless of
  // which license the facility holds.
  await seedChecklist(null, changeOfOwnership.id, [
    { phaseName: "Intake", label: "Collect new owner background check" },
    { phaseName: "Intake", label: "Verify new owner financial disclosure" },
    { phaseName: "Filing", label: "Submit change-of-ownership notice to licensing agency" },
    { phaseName: "Filing", label: "Update facility administrator of record" },
    { phaseName: "Review", label: "Confirm license transfer approval" },
  ], admin.id);

  // Wildcard, flat (no phases) — recurring compliance checklist.
  await seedChecklist(null, postLicense.id, [
    { label: "Quarterly compliance self-audit" },
    { label: "Annual staff training renewal" },
    { label: "Review incident reports on file" },
  ], admin.id);

  console.log("Checklist item templates seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
