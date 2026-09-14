// Extends seed-demo.ts with a Caregiver account and an assigned Care
// Recipient, so the Caregiver-access and geo-located clock-in/out test
// steps (see the "HCLM Backlog Test Plan" artifact) have something to test
// against without extra manual setup. Additive, idempotent, local dev DB
// only — same convention as seed-demo.ts/seed-demo-credentials.ts.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const client = await prisma.client.findFirst({ where: { name: "Riverbend Senior Living" } });

  const email = "caregiver@hclm.local";
  let caregiver = await prisma.user.findUnique({ where: { email } });
  if (!caregiver) {
    caregiver = await prisma.user.create({
      data: {
        name: "Priya Nair",
        email,
        passwordHash: await bcrypt.hash("ChangeMe123!", 12),
        role: "CAREGIVER",
      },
    });
    console.log(`Created Caregiver user: ${email} / ChangeMe123!`);
  } else {
    console.log("Caregiver user already exists, skipping.");
  }

  let recipient = await prisma.careRecipient.findFirst({ where: { name: "Dorothy Simmons" } });
  if (!recipient) {
    recipient = await prisma.careRecipient.create({
      data: {
        name: "Dorothy Simmons",
        // A real, geocodable address (Willis Tower) — geocoding is
        // best-effort and never blocks a create if GOOGLE_MAPS_API_KEY
        // isn't set locally, same convention as everywhere else.
        address: "233 S Wacker Dr, Chicago, IL 60606",
        phone: "312-555-0142",
        preferredContactMethod: "Phone",
        visitSchedule: "Mon/Wed/Fri mornings",
        clientId: client?.id,
        createdById: admin.id,
      },
    });
    console.log("Created Care Recipient: Dorothy Simmons");
  } else {
    console.log("Care Recipient already exists, skipping.");
  }

  const existingAssignment = await prisma.careRecipientAssignment.findUnique({
    where: { careRecipientId_caregiverId: { careRecipientId: recipient.id, caregiverId: caregiver.id } },
  });
  if (!existingAssignment) {
    await prisma.careRecipientAssignment.create({
      data: { careRecipientId: recipient.id, caregiverId: caregiver.id, assignedById: admin.id },
    });
    console.log("Assigned Dorothy Simmons to Priya Nair.");
  } else {
    console.log("Assignment already exists, skipping.");
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
