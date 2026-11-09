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

// Every tenant query runs inside its own short transaction (src/lib/db.ts),
// so each one has to grab a pooled connection within `maxWait`. Prisma's 2s
// default is too tight on the small prod box: right after a large upload the
// page re-render fires many queries at once while memory is tight, they queue
// for connections past 2s, and the action fails with P2028 ("Unable to start
// a transaction in the given time") even though the file was saved.
const transactionOptions = { maxWait: 15_000, timeout: 20_000 };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }), transactionOptions });

export const systemPrisma =
  globalForPrisma.systemPrisma ??
  (systemUrl === appUrl
    ? prisma
    : new PrismaClient({ adapter: new PrismaPg({ connectionString: systemUrl }), transactionOptions }));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.systemPrisma = systemPrisma;
}
