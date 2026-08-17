// Extends seed-demo.ts with an MCO credential and a login credential on the
// same demo client, so the handbook screenshots for those two features have
// something real to show. Additive, idempotent, local dev DB only — same
// convention as seed-demo.ts.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const client = await prisma.client.findFirstOrThrow({ where: { name: "Riverbend Senior Living" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const maria = await prisma.user.findFirst({ where: { email: "maria@hclm.local" } });

  const alreadySeeded = await prisma.mcoCredential.findFirst({ where: { clientId: client.id } });
  if (alreadySeeded) {
    console.log("Demo MCO/credential data already present, skipping.");
    return;
  }

  const cirStage = await prisma.pipelineStage.findFirstOrThrow({
    where: { pipeline: "MCO", abbrev: "CIR" },
  });

  const mco = await prisma.mcoCredential.create({
    data: {
      clientId: client.id,
      mcoName: "AETNA",
      stageId: cirStage.id,
      npi: "1932847561",
      providerId: "AETNA-IL-88213",
      effectiveDate: new Date("2026-06-01"),
      recredentialingDueDate: new Date("2027-06-01"),
      assignedUserId: maria?.id,
      createdById: admin.id,
    },
  });
  await prisma.stageHistory.create({
    data: { mcoCredentialId: mco.id, stageId: cirStage.id, actorId: admin.id },
  });

  await prisma.clientCredential.create({
    data: {
      clientId: client.id,
      label: "IDPH Provider Portal",
      username: "riverbend.admin",
      password: "Riverbend2026!",
      url: "https://webapps.dph.illinois.gov/onlineprovider",
      notes: "Password rotates quarterly — check the shared vault for the current one before logging in.",
      createdById: admin.id,
    },
  });

  console.log("Seeded 1 MCO credential (Aetna, In Review) and 1 login credential for Riverbend Senior Living.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
