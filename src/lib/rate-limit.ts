import { headers } from "next/headers";

// In-memory, per-key sliding-window limiter for the app's public (no
// session) write surfaces: intake forms, forgot-password. Module-level, so
// it resets on deploy/restart and isn't shared across instances if the app
// is ever scaled horizontally — fine for the current single-instance
// deploy; the first thing to swap for a real store (Redis/Upstash) if abuse
// becomes a real problem.
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
  };
}

/** The caller's IP as Caddy reports it (first X-Forwarded-For hop), or null. */
export async function getClientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
