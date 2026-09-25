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

/**
 * Absolute base URL of an org's workspace, for links that leave the browser
 * (emails, SMS). Multi-tenant mode: https://<slug>.<ROOT_DOMAIN>. Single-tenant
 * mode: the one domain Caddy serves (HCLM_DOMAIN), or localhost in dev.
 */
export function orgAppUrl(slug: string): string {
  const root = process.env.ROOT_DOMAIN?.trim().toLowerCase();
  if (root) return `https://${slug}.${root}`;
  const domain = process.env.HCLM_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}
