// Creates (or re-invites) a platform admin — an OWNER of the platform
// organization, who can reach the console at admin.<ROOT_DOMAIN> — and
// prints a one-time link to set their password. There's no one to invite
// the very first one, hence the script.
//
//   ORG_SLUG=platform npx tsx scripts/create-platform-admin.ts "Jane Doe" jane@example.com
import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db as prisma, runScriptAsTenant } from "./lib/tenant-script";
import { issueAuthToken } from "../src/lib/auth-tokens";
import { orgAppUrl, PLATFORM_SLUG } from "../src/lib/tenant-host";

async function main() {
  if ((process.env.ORG_SLUG ?? "ctk") !== PLATFORM_SLUG) throw new Error(`Run with ORG_SLUG=${PLATFORM_SLUG}`);
  const [name, email] = process.argv.slice(2);
  if (!name || !email) throw new Error('Usage: ORG_SLUG=platform npx tsx scripts/create-platform-admin.ts "Name" email@example.com');

  const user =
    (await prisma.user.findFirst({ where: { email: email.toLowerCase() } })) ??
    (await prisma.user.create({
      data: { name, email: email.toLowerCase(), role: "OWNER", passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
    }));
  const token = await issueAuthToken(user.id, "INVITE");
  console.log(`Platform admin: ${user.email}`);
  console.log(`Set the password (link works once, for 7 days):\n  ${orgAppUrl(PLATFORM_SLUG)}/set-password?token=${encodeURIComponent(token)}`);
}

runScriptAsTenant(main);
