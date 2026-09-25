import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { orgSlugFromHost } from "@/lib/tenant-host";

// Request → organization. The host → slug rule itself is in
// src/lib/tenant-host.ts (kept Prisma-free for the proxy).

export { orgSlugFromHost, RESERVED_SLUGS } from "@/lib/tenant-host";

export type HostOrg = { id: string; slug: string; name: string; status: "ACTIVE" | "SUSPENDED" };

// slug → org, cached briefly: this runs on every tenant-scoped query's first
// use in a request, and organizations almost never change. A suspended or
// renamed org takes effect within the TTL.
const CACHE_TTL_MS = 60_000;
const orgCache = new Map<string, { org: HostOrg | null; expiresAt: number }>();

export async function getOrgBySlug(slug: string): Promise<HostOrg | null> {
  const hit = orgCache.get(slug);
  if (hit && hit.expiresAt > Date.now()) return hit.org;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  });
  orgCache.set(slug, { org, expiresAt: Date.now() + CACHE_TTL_MS });
  return org;
}

/** The slug this request's host maps to, or null outside a request / for an unknown host. */
export async function getHostOrgSlug(): Promise<string | null> {
  let host: string | null;
  try {
    host = (await headers()).get("host");
  } catch {
    // Called outside a request (instrumentation jobs, scripts) — there's no host.
    return null;
  }
  return orgSlugFromHost(host);
}

/** The organization this request's host maps to, or null if none. */
export async function getHostOrg(): Promise<HostOrg | null> {
  const slug = await getHostOrgSlug();
  return slug ? getOrgBySlug(slug) : null;
}
