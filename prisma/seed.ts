import "dotenv/config";
import { db as prisma, runScriptAsTenant } from "../scripts/lib/tenant-script";
import bcrypt from "bcryptjs";


async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@hclm.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name: "Admin",
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log(`Seeded admin user: ${email} / ${password} — change this password after first login.`);
}

runScriptAsTenant(main);
