import { afterEach, describe, expect, it, vi } from "vitest";

// The handbook is one product guide for every workspace: the product name is
// filled in at serve time, and the embedded screenshots are left untouched.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("GET /handbook", () => {
  it("brands the text with PRODUCT_NAME without touching image data", async () => {
    vi.stubEnv("PRODUCT_NAME", "Permitwell");
    const { GET } = await import("@/app/handbook/route");
    const html = await (await GET()).text();
    expect(html).toContain("<title>Permitwell Staff Handbook</title>");
    expect(html).not.toMatch(/\bIDHS\b|\bIDPH\b/);
    const images = [...html.matchAll(/data:[^"]*/g)].map((m) => m[0]);
    expect(images.length).toBeGreaterThan(0);
    expect(images.some((d) => d.includes("Permitwell"))).toBe(false);
  });
});
