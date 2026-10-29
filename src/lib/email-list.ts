import { z } from "zod";

// A "Send to" or business email field may hold more than one address,
// e.g. "a@x.com; b@y.com". Split on ; , or spaces and check each one.
// Dependency-light so both the client form and server actions use it.

const emailCheck = z.string().email();

export function splitEmailList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[;,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/** The first address in the list that isn't a valid email, or undefined. */
export function findInvalidEmail(raw: string | null | undefined): string | undefined {
  return splitEmailList(raw).find((e) => !emailCheck.safeParse(e).success);
}

export function invalidEmailMessage(bad: string) {
  return `"${bad}" isn't a valid email address — separate more than one with ; or ,`;
}
