import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { isAllowedTlsHost } from "@/lib/tenant";
import { orgSlugFromHost, requestHost } from "@/lib/tenant-host";

// Host → org rules and Caddy's on-demand TLS gate (5d).

const saved = { ROOT_DOMAIN: process.env.ROOT_DOMAIN, HCLM_DOMAIN: process.env.HCLM_DOMAIN, DEFAULT_ORG_SLUG: process.env.DEFAULT_ORG_SLUG };

beforeAll(async () => {
  await prisma.organization.upsert({ where: { id: "org_tls_acme" }, create: { id: "org_tls_acme", slug: "tls-acme", name: "Acme" }, update: {} });
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function multiTenant() {
  process.env.ROOT_DOMAIN = "example.test";
  process.env.HCLM_DOMAIN = "crm.oldco.test";
  delete process.env.DEFAULT_ORG_SLUG;
}

describe("orgSlugFromHost", () => {
  it("single-tenant mode maps every host to the default org", () => {
    delete process.env.ROOT_DOMAIN;
    delete process.env.DEFAULT_ORG_SLUG;
    expect(orgSlugFromHost("anything.at.all")).toBe("ctk");
  });

  it("multi-tenant mode: subdomains, platform, legacy domain, the rest", () => {
    multiTenant();
    expect(orgSlugFromHost("tls-acme.example.test")).toBe("tls-acme");
    expect(orgSlugFromHost("TLS-ACME.example.test:443")).toBe("tls-acme");
    expect(orgSlugFromHost("admin.example.test")).toBe("platform");
    expect(orgSlugFromHost("www.example.test")).toBeNull();
    expect(orgSlugFromHost("a.b.example.test")).toBeNull();
    expect(orgSlugFromHost("crm.oldco.test")).toBe("ctk");
    expect(orgSlugFromHost("example.test")).toBeNull();
    expect(orgSlugFromHost("evil.test")).toBeNull();
  });

  it("requestHost prefers X-Forwarded-Host (set by Caddy / Next's internal requests)", () => {
    const h = (entries: Record<string, string>) => new Headers(entries);
    expect(requestHost(h({ host: "localhost:3000", "x-forwarded-host": "acme.example.test" }))).toBe("acme.example.test");
    expect(requestHost(h({ host: "acme.example.test" }))).toBe("acme.example.test");
    expect(requestHost(h({ "x-forwarded-host": "a.example.test, proxy.internal", host: "x" }))).toBe("a.example.test");
  });
});

describe("isAllowedTlsHost", () => {
  it("refuses everything in single-tenant mode", async () => {
    delete process.env.ROOT_DOMAIN;
    expect(await isAllowedTlsHost("tls-acme.example.test")).toBe(false);
  });

  it("allows existing workspaces, the platform console and the root domain only", async () => {
    multiTenant();
    expect(await isAllowedTlsHost("tls-acme.example.test")).toBe(true);
    expect(await isAllowedTlsHost("admin.example.test")).toBe(true);
    expect(await isAllowedTlsHost("example.test")).toBe(true);
    expect(await isAllowedTlsHost("nosuch.example.test")).toBe(false);
    expect(await isAllowedTlsHost("www.example.test")).toBe(false);
    expect(await isAllowedTlsHost("attacker.test")).toBe(false);
    expect(await isAllowedTlsHost("")).toBe(false);
    expect(await isAllowedTlsHost(null)).toBe(false);
  });
});
