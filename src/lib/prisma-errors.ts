// Turns a raw Prisma write failure into a message someone can actually act
// on, instead of a stack trace only visible in the server logs. Every
// server action's client-side catch already does
// `error instanceof Error ? error.message : "Failed to ..."` — so throwing
// a plain Error with a clear message here is all it takes for that message
// to reach the toast. Duck-typed on `.code` (not importing Prisma's error
// class) — same convention friendlyInvoiceNumberError started in
// src/lib/actions/invoices.ts, generalized here so every action can use it.
//
// Usage: `await prisma.x.create({...}).catch((e) => friendlyPrismaError(e, {
//   duplicateMessages: { email: "A user with that email already exists" },
// }))`. `duplicateMessages` keys are the unique constraint's field name, or
// comma-joined field names (in schema declaration order) for a composite
// constraint — see the call sites below for examples. Missing entries fall
// back to a generic but still-readable message naming whatever field(s)
// Prisma reported, so a constraint added later without a matching entry
// here never regresses to a raw error.
//
// Field names come out of two different shapes depending on Prisma/driver
// version — the classic query-engine one (`meta.target`, string or
// string[]) and the driver-adapter one this app's Postgres adapter
// actually throws (`meta.driverAdapterError.cause.constraint.fields`,
// verified directly against a live P2002 from this schema). Both are
// checked so this doesn't silently stop working on the next Prisma bump.
type PrismaKnownError = {
  code: string;
  meta?: {
    target?: string[] | string;
    driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
  };
};

function asPrismaKnownError(error: unknown): PrismaKnownError | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code: unknown }).code;
  if (typeof code !== "string" || !/^P\d{4}$/.test(code)) return null;
  return error as PrismaKnownError;
}

// Postgres quotes a mixed-case column identifier in the constraint
// definition it reports (`"invoiceNumber"`) but leaves an all-lowercase one
// bare (`email`) — strip the quotes either way so callers/lookups never
// have to think about which case they're in.
function unquote(field: string) {
  return field.startsWith('"') && field.endsWith('"') ? field.slice(1, -1) : field;
}

function duplicateFields(known: PrismaKnownError): string[] {
  const target = known.meta?.target;
  const raw = Array.isArray(target)
    ? target
    : typeof target === "string" && target
      ? [target]
      : (known.meta?.driverAdapterError?.cause?.constraint?.fields ?? []);
  return raw.map(unquote);
}

export function friendlyPrismaError(
  error: unknown,
  options?: {
    /** Keyed by the unique constraint's field name (or comma-joined field
     * names for a composite constraint) that failed. */
    duplicateMessages?: Record<string, string>;
    /** P2025 — the row being updated/deleted is already gone (e.g. someone
     * else deleted it, or a race with another request). */
    notFoundMessage?: string;
    /** P2003 — this write is blocked by a foreign key: either it references
     * something that doesn't exist, or something else still references
     * the row being deleted. */
    referencedMessage?: string;
  }
): never {
  const known = asPrismaKnownError(error);
  if (known) {
    if (known.code === "P2002") {
      const fields = duplicateFields(known);
      const fallback = fields.length > 0 ? `That ${fields.join(" + ")} is already in use.` : "That value is already in use.";
      throw new Error(options?.duplicateMessages?.[fields.join(",")] ?? fallback);
    }
    if (known.code === "P2025") {
      throw new Error(
        options?.notFoundMessage ?? "That record no longer exists — someone may have already deleted it. Refresh and try again."
      );
    }
    if (known.code === "P2003") {
      throw new Error(options?.referencedMessage ?? "Can't complete this — something else still depends on it.");
    }
  }
  throw error;
}
