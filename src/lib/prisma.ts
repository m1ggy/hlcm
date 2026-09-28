import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Two connection pools (see docs/multitenancy-plan.md, Phase 6):
//
// - `prisma` connects as the *app* role (DATABASE_URL). Every tenant query
//   goes through it via src/lib/db.ts, and Postgres row-level security
//   limits it to the organization in app.org_id — even if app code forgot a
//   filter. Never use it directly for tenant data; use `db`.
// - `systemPrisma` connects as the table *owner* (SYSTEM_DATABASE_URL), which
//   RLS exempts. Only the few modules that genuinely work across
//   organizations use it (tenant.ts, platform.ts, the scheduled-job org loop,
//   scripts), and it's what migrations run as.
//
// Until the app role exists (scripts/setup-app-db-role.sh), both URLs are the
// owner and everything behaves as before.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  systemPrisma: PrismaClient | undefined;
};

const appUrl = process.env.DATABASE_URL;
const systemUrl = process.env.SYSTEM_DATABASE_URL || appUrl;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });

export const systemPrisma =
  globalForPrisma.systemPrisma ??
  (systemUrl === appUrl ? prisma : new PrismaClient({ adapter: new PrismaPg({ connectionString: systemUrl }) }));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.systemPrisma = systemPrisma;
}
