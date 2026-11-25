import { cookies } from "next/headers";
import { isValidOrgSlug } from "@/lib/tenant-host";

// A managing company's staff work in a client workspace through a linked
// account (src/lib/workspace-switch.ts) that has no password of its own, so
// that workspace's sign-in page is a dead end for them once the idle timeout
// (src/auth.ts) ends the session there. This cookie, set on the client
// workspace's host when they switch in, remembers where they came from: its
// /login sends them to their home workspace's sign-in instead, which brings
// them straight back (/switch/to).
//
// It only names a workspace (no account, nothing secret); a stale or forged
// value at worst sends someone to another workspace's sign-in page, where
// "sign in here instead" brings them back.

const COOKIE = "linked_home";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function rememberLinkedHome(homeSlug: string) {
  (await cookies()).set(COOKIE, homeSlug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function forgetLinkedHome() {
  const store = await cookies();
  if (store.has(COOKIE)) store.delete(COOKIE);
}

/** The home workspace remembered on this host, if any. */
export async function linkedHomeSlug(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && isValidOrgSlug(value) ? value : null;
}
