import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { getHostOrg } from "@/lib/tenant";

// Tenant-scoped Prisma access (see docs/multitenancy-plan.md, Phase 2).
//
// Every model carries an organizationId. `db` (and `tenantDb(orgId)`) add it
// to every query's `where`, and run each statement in a transaction that
// first sets the Postgres setting `app.org_id` — the organizationId column
// default reads that setting, so creates (nested ones included) land in the
// right org without passing it, and a write with no tenant context fails with
// a NOT NULL violation instead of landing in the wrong org.
//
// Which org: an explicit runAsTenant() scope first (instrumentation jobs,
// anything with no request), otherwise the request's host (src/lib/tenant.ts).
// With neither, every query throws — there is no "default org" fallback here.
//
// The raw client in @/lib/prisma bypasses all of this; it's only for the
// handful of places that genuinely work across orgs (see the ESLint
// allowlist in eslint.config.mjs).

// Operations whose `where` is a plain filter: AND the org into it.
const FILTER_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);
// Operations whose `where` is a unique selector: Prisma accepts extra
// non-unique fields alongside the unique ones, so another org's id simply
// doesn't match (findUnique → null, update/delete → "record not found",
// upsert → creates a new row in this org).
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

type Args = Record<string, unknown> | undefined;

function scopeArgs(orgId: string, operation: string, args: Args): Args {
  if (FILTER_OPS.has(operation)) {
    const where = args?.where;
    return { ...args, where: where ? { AND: [where, { organizationId: orgId }] } : { organizationId: orgId } };
  }
  if (UNIQUE_OPS.has(operation)) {
    return { ...args, where: { ...(args?.where as object), organizationId: orgId } };
  }
  // create / createMany / createManyAndReturn: the column default supplies the org.
  return args;
}

function setOrgSql(orgId: string) {
  return prisma.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
}

// Filters only — used inside an interactive transaction, where app.org_id is
// set once at the start instead of per statement.
function filteredClient(orgId: string) {
  return prisma.$extends({
    name: "tenant-filter",
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          return query(scopeArgs(orgId, operation, args as Args));
        },
      },
    },
  });
}

// Filters + per-statement app.org_id for standalone (non-transaction) queries.
function standaloneClient(orgId: string) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const [, result] = await prisma.$transaction([setOrgSql(orgId), query(scopeArgs(orgId, operation, args as Args))]);
          return result;
        },
      },
    },
  });
}

type FilteredClient = ReturnType<typeof filteredClient>;
type StandaloneClient = ReturnType<typeof standaloneClient>;

/** The client handed to a `db.$transaction(async (tx) => …)` callback. */
export type TenantTx = Parameters<Parameters<FilteredClient["$transaction"]>[0]>[0];
type TxOptions = Parameters<FilteredClient["$transaction"]>[1];

const RAW_METHODS = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]);

export type TenantClient = Omit<StandaloneClient, "$transaction" | "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe"> & {
  /**
   * Interactive form only. The array form is rejected: its queries would each
   * run in their own per-statement transaction (the spike showed they don't
   * roll back together), so it can't be made atomic here.
   */
  $transaction<T>(fn: (tx: TenantTx) => Promise<T>, options?: TxOptions): Promise<T>;
};

const clients = new Map<string, TenantClient>();

/** A Prisma client scoped to one organization. Cached per org. */
export function tenantDb(orgId: string): TenantClient {
  const cached = clients.get(orgId);
  if (cached) return cached;

  const standalone = standaloneClient(orgId);
  const filtered = filteredClient(orgId);

  const client = new Proxy(standalone, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return (fn: unknown, options?: TxOptions) => {
          if (typeof fn !== "function") {
            throw new Error("db.$transaction([...]) isn't tenant-safe — use the interactive form: db.$transaction(async (tx) => …)");
          }
          return filtered.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
            return (fn as (tx: TenantTx) => Promise<unknown>)(tx);
          }, options);
        };
      }
      if (typeof prop === "string" && RAW_METHODS.has(prop)) {
        throw new Error(`db.${prop} isn't tenant-scoped — add the organizationId filter yourself via the raw client (see eslint.config.mjs allowlist)`);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as TenantClient;

  clients.set(orgId, client);
  return client;
}

const tenantScope = new AsyncLocalStorage<string>();

/** Runs `fn` with `db` scoped to `orgId` — for code with no request (jobs, scripts). */
export function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  return tenantScope.run(orgId, fn);
}

export class TenantNotResolvedError extends Error {
  constructor() {
    super("No tenant for this request: unknown host, suspended organization, or no runAsTenant() scope");
    this.name = "TenantNotResolvedError";
  }
}

/** The current organization's id — runAsTenant() scope first, then the request host. */
export async function currentOrgId(): Promise<string> {
  const scoped = tenantScope.getStore();
  if (scoped) return scoped;
  const org = await getHostOrg();
  if (!org || org.status !== "ACTIVE") throw new TenantNotResolvedError();
  return org.id;
}

/** The current organization's client. */
export async function getDb(): Promise<TenantClient> {
  return tenantDb(await currentOrgId());
}

// `db` is a stand-in for the current org's client that resolves it lazily on
// each call, so call sites read exactly like the old global `prisma`:
// `await db.client.findMany(...)`. Every call returns a real Promise (not a
// lazy PrismaPromise), which is fine now that the array form of $transaction
// is gone.
export const db: TenantClient = new Proxy({} as TenantClient, {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    if (prop === "then") return undefined; // never look like a thenable
    if (prop.startsWith("$")) {
      return (...args: unknown[]) =>
        getDb().then((client) => (client as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args));
    }
    return new Proxy(
      {},
      {
        get(_m, method) {
          if (typeof method !== "string" || method === "then") return undefined;
          return (...args: unknown[]) =>
            getDb().then((client) => {
              const delegate = (client as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>)[prop];
              return delegate[method](...args);
            });
        },
      }
    );
  },
});
