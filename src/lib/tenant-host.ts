// Pure host → org slug mapping, with no Prisma/Node imports so the proxy's
// auth check (src/auth.config.ts) can use it. DB lookups live in
// src/lib/tenant.ts.
//
// Which organization (tenant) a request belongs to is decided by its host:
// <slug>.<ROOT_DOMAIN> → the org with that slug (see docs/multitenancy-plan.md).
//
// Single-tenant mode (ROOT_DOMAIN unset — every deploy before subdomains go
// live): every host maps to DEFAULT_ORG_SLUG, "ctk" unless overridden, so an
// existing deploy keeps working with no env change. Multi-tenant mode
// (ROOT_DOMAIN set): only subdomains of it resolve; any other host (the bare
// root domain, a legacy domain) maps to DEFAULT_ORG_SLUG only if that's set.
//
// The host comes from requestHost(): X-Forwarded-Host first, then Host.
// Next itself needs that order — when a Server Action redirects, Next renders
// the target with an internal request to localhost:<port>, carrying the
// browser's host only in X-Forwarded-Host. It's trustworthy here because
// every outside request arrives through Caddy, which sets X-Forwarded-Host
// from the real Host and ignores any client-supplied copy (no
// trusted_proxies configured), and the app's own port isn't published.

// The operator's own organization: the platform console (create / suspend
// tenant workspaces) lives there, reached at admin.<ROOT_DOMAIN>. Its users
// are the platform admins; like any org, it can't see tenants' data.
export const PLATFORM_SLUG = "platform";
const PLATFORM_SUBDOMAIN = "admin";

// Subdomains that can never be a tenant slug (see the reserved list in the plan).
export const RESERVED_SLUGS = new Set(["www", "admin", "api", "app", "platform", "mail", "status", "docs", "help"]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The host a request was made to — see the note above on why X-Forwarded-Host comes first. */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  return headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
}

export function orgSlugFromHost(host: string | null | undefined): string | null {
  const hostname = host?.split(":")[0]?.trim().toLowerCase();
  if (!hostname) return null;

  const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return process.env.DEFAULT_ORG_SLUG || "ctk";

  if (hostname.endsWith(`.${root}`)) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (sub === PLATFORM_SUBDOMAIN) return PLATFORM_SLUG;
    if (SLUG_PATTERN.test(sub) && !RESERVED_SLUGS.has(sub)) return sub;
    return null;
  }
  return process.env.DEFAULT_ORG_SLUG || null;
}

/**
 * Absolute base URL of an org's workspace, for links that leave the browser
 * (emails, SMS). Multi-tenant mode: https://<slug>.<ROOT_DOMAIN>. Single-tenant
 * mode: the one domain Caddy serves (HCLM_DOMAIN), or localhost in dev.
 */
export function orgAppUrl(slug: string): string {
  const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (root) {
    const sub = slug === PLATFORM_SLUG ? PLATFORM_SUBDOMAIN : slug;
    // Local multi-tenant dev (ROOT_DOMAIN=localhost): plain http on the dev port.
    if (root === "localhost") return `http://${sub}.localhost:${process.env.PORT || 3000}`;
    return `https://${sub}.${root}`;
  }
  const domain = process.env.HCLM_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}

/** Whether `slug` could name a new tenant: DNS-safe and not reserved. */
export function isValidOrgSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}
