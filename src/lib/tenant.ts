import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Which organization (tenant) a request belongs to is decided by its host:
// <slug>.<ROOT_DOMAIN> → the org with that slug (see docs/multitenancy-plan.md).
//
// Single-tenant mode (ROOT_DOMAIN unset — every deploy before subdomains go
// live): every host maps to DEFAULT_ORG_SLUG, "ctk" unless overridden, so an
// existing deploy keeps working with no env change. Multi-tenant mode
// (ROOT_DOMAIN set): only subdomains of it resolve; any other host (the bare
// root domain, a legacy domain) maps to DEFAULT_ORG_SLUG only if that's set.
//
// Deliberately reads the plain `host` header, never X-Forwarded-Host — Caddy
// passes the original Host through, and a forwarded header is client-spoofable.

// Subdomains that can never be a tenant slug (see the reserved list in the plan).
export const RESERVED_SLUGS = new Set(["www", "admin", "api", "app", "platform", "mail", "status", "docs", "help"]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function orgSlugFromHost(host: string | null | undefined): string | null {
  const hostname = host?.split(":")[0]?.trim().toLowerCase();
  if (!hostname) return null;

  const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return process.env.DEFAULT_ORG_SLUG || "ctk";

  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (SLUG_PATTERN.test(sub) && !RESERVED_SLUGS.has(sub)) return sub;
    return null;
  }
  return process.env.DEFAULT_ORG_SLUG || null;
}

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
