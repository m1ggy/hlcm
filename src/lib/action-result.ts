import { UserFacingError } from "@/lib/user-facing-error";
import { friendlyPrismaError } from "@/lib/prisma-errors";

// Server Actions in production redact the message of anything they throw
// (see UserFacingError), so an action whose failures the user should read
// returns this instead of throwing. Wrap the action body with
// toActionResult and check `result.ok` in the caller.
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    // Raw Prisma failures (already-deleted row, duplicate, foreign key) become
    // readable messages; anything else comes back out of friendlyPrismaError
    // unchanged.
    let cause = error;
    try {
      friendlyPrismaError(error);
    } catch (friendly) {
      cause = friendly;
    }
    if (cause instanceof UserFacingError) return { ok: false, error: cause.message };
    // Not something we wrote for the user — rethrow so Next logs it (with a
    // digest) and redirect()/notFound() keep working.
    throw cause;
  }
}

// For a client `catch` around an action call: what reaches it is either an
// unexpected server error (message redacted in production) or a failed
// request (network drop, body rejected before the action ran). Show a plain
// fallback in production; in development the real message is more useful.
export function unexpectedErrorMessage(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== "production" && error instanceof Error) return error.message;
  return fallback;
}
