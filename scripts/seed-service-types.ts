// Populates the ServiceType catalog from docs/pipeline-stage-plan.md — the
// project pill colors on the Clients list. "Unmapped project (default)" is
// deliberately not seeded here: it's a UI fallback constant
// (src/lib/service-type.ts), not a selectable ServiceType row, per the
// spec ("any project not on this list gets the neutral default").
//
// Idempotent: upserted on the unique `name`.
//
// Run: npx tsx scripts/seed-service-types.ts
import "dotenv/config";
import { db as prisma, runScriptAsTenant } from "./lib/tenant-script";


const SERVICE_TYPES = [
  { name: "Ace Home Care Franchise", hex: "#FDD835", textColor: "#4A3B00" },
  { name: "CILA", hex: "#1565C0", textColor: "#FFFFFF" },
  { name: "Home Care", hex: "#E65100", textColor: "#FFFFFF" },
  { name: "Group Home", hex: "#2E7D32", textColor: "#FFFFFF" },
  { name: "Virtual Assistant", hex: "#6A1B9A", textColor: "#FFFFFF" },
  { name: "MCO", hex: "#C62828", textColor: "#FFFFFF" },
];

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN user found — seed a user first.");

  for (const service of SERVICE_TYPES) {
    await prisma.serviceType.upsert({
      where: { name: service.name },
      update: { hex: service.hex, textColor: service.textColor },
      create: { ...service, createdById: admin.id },
    });
  }
  console.log(`Upserted ${SERVICE_TYPES.length} service types.`);
}

runScriptAsTenant(main);
