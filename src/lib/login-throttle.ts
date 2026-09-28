// Brute-force protection for sign-in: counts *failed* attempts in a sliding
// window per client IP and per account (workspace + email), and refuses
// further tries once either is over its limit — so a correct password from a
// throttled account still waits, and a real user mistyping a few times never
// notices. A successful sign-in clears that account's count. Covers the
// password step, NextAuth's credentials endpoint (authorize) and MFA codes.
//
// In-memory and per-process (like src/lib/rate-limit.ts): fine for the
// single-instance deploy; resets on restart.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 30;
const MAX_FAILURES_PER_ACCOUNT = 8;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

const ipKey = (ip: string | null) => `ip:${ip ?? "unknown"}`;
const accountKey = (orgId: string, email: string) => `acct:${orgId}:${email.trim().toLowerCase()}`;

/** Whether sign-in attempts from this IP / for this account are currently refused. */
export function isLoginThrottled(ip: string | null, orgId: string, email: string): boolean {
  const now = Date.now();
  return recent(ipKey(ip), now).length >= MAX_FAILURES_PER_IP || recent(accountKey(orgId, email), now).length >= MAX_FAILURES_PER_ACCOUNT;
}

export function recordLoginFailure(ip: string | null, orgId: string, email: string) {
  const now = Date.now();
  for (const key of [ipKey(ip), accountKey(orgId, email)]) {
    failures.set(key, [...recent(key, now), now]);
  }
}

export function clearLoginFailures(orgId: string, email: string) {
  failures.delete(accountKey(orgId, email));
}

export const THROTTLED_MESSAGE = "Too many failed sign-in attempts. Please wait 15 minutes and try again.";
