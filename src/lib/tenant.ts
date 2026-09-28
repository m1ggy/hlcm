import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { orgSlugFromHost } from "@/lib/tenant-host";

// Request → organization. The host → slug rule itself is in
// src/lib/tenant-host.ts (kept Prisma-free for the proxy).

export { orgSlugFromHost, RESERVED_SLUGS } from "@/lib/tenant-host";

export type HostOrg = { id: string; slug: string; name: string; status: "ACTIVE" | "SUSPENDED"; timezone: string | null };

// slug → org, cached briefly: this runs on every tenant-scoped query's first
// use in a request, and organizations almost never change. A suspended or
// renamed org takes effect within the TTL.
const CACHE_TTL_MS = 60_000;
// On globalThis, not module scope: the bundler can load this module more than
// once in one server process (e.g. once for Server Actions, once for page
// rendering), and forgetOrg() after a rename must clear the cache the next
// render reads, not just its own copy.
const globalForOrgs = globalThis as unknown as { __hclmOrgCache?: Map<string, { org: HostOrg | null; expiresAt: number }> };
const orgCache = (globalForOrgs.__hclmOrgCache ??= new Map());

/** Drop a cached org (after renaming it, changing its timezone, suspending it). */
export function forgetOrg(slug: string) {
  orgCache.delete(slug);
}

export async function getOrgBySlug(slug: string): Promise<HostOrg | null> {
  const hit = orgCache.get(slug);
  if (hit && hit.expiresAt > Date.now()) return hit.org;
  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true, timezone: true },
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

/**
 * Updates an organization's own settings. The organizations table isn't
 * tenant-scoped (it *is* the tenant list), so this goes through the raw
 * client here rather than `db`; callers check who may do it.
 */
export async function updateOrganizationSettings(orgId: string, data: { name?: string; timezone?: string | null }) {
  const org = await prisma.organization.update({
    where: { id: orgId },
    data,
    select: { id: true, slug: true, name: true, status: true, timezone: true },
  });
  forgetOrg(org.slug);
  return org;
}
