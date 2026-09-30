import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTerms, needsTermsAcceptance } from "@/lib/terms";

// Terms acceptance is off until all three env values are set, and asks
// again whenever TERMS_VERSION changes. The platform org never has to.

afterEach(() => vi.unstubAllEnvs());

function configure(version = "2026-10") {
  vi.stubEnv("TERMS_VERSION", version);
  vi.stubEnv("TERMS_URL", "https://example.test/terms");
  vi.stubEnv("PRIVACY_URL", "https://example.test/privacy");
}

describe("terms acceptance", () => {
  it("asks nothing until the terms are configured", () => {
    vi.stubEnv("TERMS_VERSION", "2026-10");
    vi.stubEnv("TERMS_URL", "");
    expect(currentTerms()).toBeNull();
    expect(needsTermsAcceptance({ slug: "acme", termsVersion: null })).toBe(false);
  });

  it("asks until the current version is accepted, and again after it changes", () => {
    configure("2026-10");
    expect(needsTermsAcceptance({ slug: "acme", termsVersion: null })).toBe(true);
    expect(needsTermsAcceptance({ slug: "acme", termsVersion: "2026-10" })).toBe(false);
    configure("2027-01");
    expect(needsTermsAcceptance({ slug: "acme", termsVersion: "2026-10" })).toBe(true);
    expect(needsTermsAcceptance({ slug: "platform", termsVersion: null })).toBe(false);
  });
});
